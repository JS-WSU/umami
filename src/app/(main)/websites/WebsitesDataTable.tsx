'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon, Row, Text } from '@umami/react-zen';
import { useQueries } from '@tanstack/react-query';
import { DataGrid } from '@/components/common/DataGrid';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation, useUserWebsitesQuery, useApi } from '@/components/hooks';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import { useFilterParameters } from '@/components/hooks/useFilterParameters';
import { Favicon } from '@/index';
import { WebsitesTable, type WebsiteRow } from './WebsitesTable';

interface WebsiteStatsResponse {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

export function WebsitesDataTable({
  userId,
  teamId,
  allowEdit = true,
  allowView = true,
  showActions = true,
}: {
  userId?: string;
  teamId?: string;
  allowEdit?: boolean;
  allowView?: boolean;
  showActions?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read the limit parameter instead of pageSize to align with Umami's database filters schema
  const urlLimit = searchParams.get('limit');
  const limit = urlLimit ? Number(urlLimit) : 10;
  const page = Number(searchParams.get('page')) || 1;

  const { user } = useLoginQuery();
  const { renderUrl } = useNavigation();
  const { get } = useApi();
  
  const { startAt, endAt } = useDateParameters();
  const filters = useFilterParameters();

  // Explicitly passing 'limit' and 'page' updates the Query Key, triggering correct server pagination
  const queryResult = useUserWebsitesQuery({
    userId: userId || user?.id,
    teamId,
    limit,
    page,
  } as unknown as { userId?: string; teamId?: string });

  const websites: WebsiteRow[] = queryResult.data?.data || [];

  const statsQueries = useQueries({
    queries: websites.map((website) => ({
      queryKey: ['websites:stats', { websiteId: website.id, startAt, endAt, ...filters }],
      queryFn: () => get(`/websites/${website.id}/stats`, { startAt, endAt, ...filters }) as Promise<WebsiteStatsResponse>,
    })),
  });

  const urlOrderBy = searchParams.get('orderBy');
  
  // Set default sorting to popularity (pageviews descending) on initial load
  const [localSort, setLocalSort] = useState<{ key: string; dir: string } | null>(
    urlOrderBy ? null : { key: 'pageviews', dir: 'desc' }
  );

  useEffect(() => {
    if (urlOrderBy) {
      setLocalSort(null);
    }
  }, [urlOrderBy]);

  // Merge the fetched query states with stats at the React Query level
  const modifiedQueryResult = useMemo(() => {
    if (!queryResult.data) return queryResult;
    
    const mapped = websites.map((website, index) => {
      const stats = statsQueries[index]?.data;
      return {
        ...website,
        visitors: stats?.visitors || 0,
        pageviews: stats?.pageviews || 0,
      };
    });

    return {
      ...queryResult,
      data: {
        ...queryResult.data,
        data: mapped,
      },
    };
  }, [queryResult, websites, statsQueries]);

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', e.target.value);
    params.set('page', '1'); // Reset page when layout limit changes
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleMetricSort = (key: string) => {
    setLocalSort((prev) => ({
      key,
      dir: prev?.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
    
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('orderBy')) {
      params.delete('orderBy');
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  const renderLink = (row: WebsiteRow) => (
    <Row alignItems="center" gap="3">
      <Icon size="md" color="muted">
        <Favicon domain={row.domain} />
      </Icon>
      <Link href={renderUrl(`/websites/${row.id}`, false)}>{row.name}</Link>
    </Row>
  );

  return (
    <>
      <Row justifyContent="end" paddingBottom="4" gap="2" alignItems="center">
        <Text>Show:</Text>
        <select
          value={limit}
          onChange={handleLimitChange}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-color)',
            color: 'var(--text-color)',
          }}
        >
          <option value={10}>10</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </Row>
      
      {/* Pass the enriched queryResult so DataGrid handles pagination on mapped data */}
      <DataGrid query={modifiedQueryResult as unknown as typeof queryResult} allowSearch allowPaging>
        {({ data }) => {
          // 'data' is now strictly paginated (e.g., 10 rows maximum)
          const sortedPageData = localSort?.key
            ? [...data].sort((a, b) => {
                const valA = Number(a[localSort.key as keyof typeof a] || 0);
                const valB = Number(b[localSort.key as keyof typeof b] || 0);
                return localSort.dir === 'desc' ? valB - valA : valA - valB;
              })
            : data;

          return (
            <WebsitesTable
              data={sortedPageData}
              showActions={showActions}
              allowEdit={allowEdit}
              allowView={allowView}
              renderLink={renderLink}
              localSort={localSort}
              onMetricSort={handleMetricSort}
            />
          );
        }}
      </DataGrid>
    </>
  );
}
