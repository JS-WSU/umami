'use client';
import { Loading, useToast } from '@umami/react-zen';
import { createContext, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApi, useMessages, useModified, useNavigation } from '@/components/hooks';
import { useBoardQuery } from '@/components/hooks/queries/useBoardQuery';
import { BOARD_TYPES, getBoardType } from '@/lib/boards';
import type { Board, BoardParameters } from '@/lib/types';
import { getComponentDefinition } from './boardComponentRegistry';

export type LayoutGetter = () => Partial<BoardParameters> | null;

export interface BoardContextValue {
  board: Partial<Board>;
  editing: boolean;
  updateBoard: (data: Partial<Board>) => void;
  saveBoard: () => Promise<Board>;
  isPending: boolean;
  registerLayoutGetter: (getter: LayoutGetter) => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

const createDefaultBoard = (): Partial<Board> => ({
  type: BOARD_TYPES.mixed,
  name: '',
  description: '',
  parameters: {
    rows: [{ id: uuid(), columns: [{ id: uuid(), component: null }] }],
  },
});

function sanitizeBoardParameters(parameters?: BoardParameters): BoardParameters | undefined {
  if (!parameters?.rows) {
    return parameters;
  }

  return {
    ...parameters,
    rows: parameters.rows.map(row => ({
      ...row,
      columns: row.columns.map(column => {
        if (column.component && !getComponentDefinition(column.component.type)) {
          return {
            ...column,
            component: null,
          };
        }

        return column;
      }),
    })),
  };
}

export function BoardProvider({
  boardId,
  editing = false,
  children,
}: {
  boardId?: string;
  editing?: boolean;
  children: ReactNode;
}) {
  const { data, isFetching, isLoading } = useBoardQuery(boardId);
  const { post, useMutation } = useApi();
  const { touch } = useModified();
  const { toast } = useToast();
  const { t, labels, messages } = useMessages();
  const { router, renderUrl, teamId } = useNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [board, setBoard] = useState<Partial<Board>>(data ?? createDefaultBoard());
  const boardRef = useRef<Partial<Board>>(data ?? createDefaultBoard());
  const layoutGetterRef = useRef<LayoutGetter | null>(null);
  const appliedFiltersRef = useRef<string | null>(null);

  // Capture the exact search parameters on the very first mount.
  // This allows us to differentiate between user-provided share links and auto-injected fallbacks.
  const initialParamsRef = useRef<URLSearchParams | null>(null);
  if (initialParamsRef.current === null) {
    initialParamsRef.current = new URLSearchParams(searchParams?.toString() || '');
  }

  const registerLayoutGetter = useCallback((getter: LayoutGetter) => {
    layoutGetterRef.current = getter;
  }, []);

  // 1. Initialize board state from server data
  useEffect(() => {
    if (data) {
      const nextBoard = {
        ...data,
        type: getBoardType(data, { coerceDashboard: true }),
        parameters: sanitizeBoardParameters(data.parameters),
      };

      boardRef.current = nextBoard;
      setBoard(nextBoard);
    }
  }, [data]);

  // 2. Compute hydration logic during render to block child components from injecting defaults
  const currentParams = new URLSearchParams(searchParams?.toString() || '');
  let needsHydration = false;
  const hydratedParams = new URLSearchParams(currentParams.toString());

  if (data && appliedFiltersRef.current !== data.id) {
    const typedParams = data.parameters as BoardParameters & { defaultFilters?: Record<string, string> };
    
    if (typedParams?.defaultFilters) {
      Object.entries(typedParams.defaultFilters).forEach(([key, value]) => {
        // Only hydrate if the param wasn't explicitly supplied in the initial URL load
        if (!initialParamsRef.current?.has(key)) {
          // Prevent infinite loops by only updating if the value actually differs
          if (currentParams.get(key) !== String(value)) {
            hydratedParams.set(key, String(value));
            needsHydration = true;
          }
        }
      });
    }
  }

  const hydratedParamsString = hydratedParams.toString();

  useEffect(() => {
    if (needsHydration) {
      // Trigger URL replacement but do not mark as applied yet.
      // We wait for Next.js to update the URL and trigger a re-render.
      const path = pathname ? `${pathname}?${hydratedParamsString}` : `?${hydratedParamsString}`;
      router.replace(path, { scroll: false });
    } else if (data && appliedFiltersRef.current !== data.id) {
      // Once we don't need hydration (either it finished or wasn't needed), lock it.
      appliedFiltersRef.current = data.id;
    }
  }, [needsHydration, hydratedParamsString, data, pathname, router]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (boardData: Partial<Board>) => {
      if (boardData.id) {
        return post(`/boards/${boardData.id}`, boardData);
      }
      return post('/boards', {
        ...boardData,
        type: boardData.type || BOARD_TYPES.mixed,
        slug: '',
        teamId,
      });
    },
  });

  const updateBoard = useCallback((data: Partial<Board>) => {
    setBoard(current => {
      const nextBoard = { ...current, ...data };
      boardRef.current = nextBoard;

      return nextBoard;
    });
  }, []);

  const saveBoard = useCallback(async () => {
    const currentBoard = boardRef.current;
    const defaultName = t(labels.untitled);
    const layoutData = layoutGetterRef.current?.();

    // Dynamically extract ALL current search parameters to reliably capture the exact date and segment states.
    // This prevents missing parameters if the time filter uses unexpected or changing keys.
    const defaultFilters: Record<string, string> = {};
    if (searchParams) {
      Array.from(searchParams.entries()).forEach(([key, val]) => {
        defaultFilters[key] = val;
      });
    }

    const mergedParameters = {
      ...currentBoard.parameters,
      ...layoutData,
    } as BoardParameters & { defaultFilters?: Record<string, string> };

    if (Object.keys(defaultFilters).length > 0) {
      mergedParameters.defaultFilters = defaultFilters;
    } else {
      delete mergedParameters.defaultFilters;
    }

    const parameters = sanitizeBoardParameters(mergedParameters);

    const result = await mutateAsync({
      ...currentBoard,
      name: currentBoard.name || defaultName,
      parameters,
    });

    toast(t(messages.saved));
    touch('boards');

    if (currentBoard.id) {
      touch(`board:${currentBoard.id}`);
    } else if (result?.id) {
      router.push(renderUrl(`/boards/${result.id}`));
    }

    return result;
  }, [mutateAsync, toast, t, labels.untitled, messages.saved, touch, router, renderUrl, searchParams]);

  // Block rendering of child components if fetching data or if we are actively hydrating the URL. 
  // This physically prevents components from prematurely injecting default fallbacks.
  if ((boardId && isFetching && isLoading) || needsHydration) {
    return <Loading placement="absolute" />;
  }

  return (
    <BoardContext.Provider
      value={{ board, editing, updateBoard, saveBoard, isPending, registerLayoutGetter }}
    >
      {children}
    </BoardContext.Provider>
  );
}
