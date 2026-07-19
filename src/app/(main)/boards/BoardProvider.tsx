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
  const [isHydrating, setIsHydrating] = useState(false);
  const boardRef = useRef<Partial<Board>>(data ?? createDefaultBoard());
  const layoutGetterRef = useRef<LayoutGetter | null>(null);
  const appliedFiltersRef = useRef<string | null>(null);

  // Capture the original searchParams on first mount before any child components
  // can aggressively inject their default fallbacks.
  const initialParamsRef = useRef<URLSearchParams | null>(null);
  if (initialParamsRef.current === null && searchParams !== null) {
    initialParamsRef.current = new URLSearchParams(searchParams.toString());
  }

  const registerLayoutGetter = useCallback((getter: LayoutGetter) => {
    layoutGetterRef.current = getter;
  }, []);

  // 1. Independent effect for initializing standard Board data.
  // We omit searchParams here to ensure URL modifications don't reset unsaved board edits.
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

  // 2. Hydration effect for applying saved view filters from the server.
  // Blocks children rendering until the router finishes updating the URL.
  useEffect(() => {
    if (data && appliedFiltersRef.current !== data.id) {
      const typedParams = data.parameters as BoardParameters & {
        defaultFilters?: Record<string, string>;
      };

      appliedFiltersRef.current = data.id;

      let hasChanges = false;
      const currentParams = new URLSearchParams(searchParams?.toString() || '');

      if (typedParams?.defaultFilters) {
        Object.entries(typedParams.defaultFilters).forEach(([key, value]) => {
          // Only apply if the user didn't intentionally arrive with this param already
          if (!initialParamsRef.current?.has(key)) {
            currentParams.set(key, String(value));
            hasChanges = true;
          }
        });
      }

      if (hasChanges) {
        setIsHydrating(true);
        const path = pathname ? `${pathname}?${currentParams.toString()}` : `?${currentParams.toString()}`;
        router.replace(path, { scroll: false });
      }
    } else if (isHydrating) {
      // Once searchParams update successfully, this effect fires again and we can unblock rendering
      setIsHydrating(false);
    }
  }, [data, router, pathname, searchParams, isHydrating]);

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

    // Get current layout sizes from BoardEditBody if registered
    const layoutData = layoutGetterRef.current?.();

    // Extract current view filters
    const defaultFilters: Record<string, string> = {};
    const filterKeys = [
      'dateRange', 'startAt', 'endAt', 'segment', 
      'compare', 'compareStartAt', 'compareEndAt', 'compareDateRange',
      'startDate', 'endDate', 'range', 'start', 'end', 
      'browser', 'os', 'device', 'screen', 'language', 'country', 'region', 'city',
      'url', 'referrer', 'title', 'host', 'event',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
    ];

    if (searchParams) {
      filterKeys.forEach(key => {
        const val = searchParams.get(key);
        if (val) {
          defaultFilters[key] = val;
        }
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

  // Keep Loading active if we are intentionally hydrating the URL
  if ((boardId && isFetching && isLoading) || isHydrating) {
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
