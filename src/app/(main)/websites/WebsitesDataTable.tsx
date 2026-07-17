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

  // Parse page limits cleanly from the URL 
  const urlPageSize = searchParams.get('pageSize');
  const [pageSize, setPageSize] = useState<number>(urlPageSize ? Number(urlPageSize) : 50);

  const { user } = useLoginQuery();
  const { renderUrl } = useNavigation();
  const { get } = useApi();
  
  // Necessary hooks to calculate the appropriate dates, avoiding zeros.
  const { startAt, endAt } = useDateParameters();
  const filters = useFilterParameters();

  const queryResult = useUserWebsitesQuery({
    userId: userId || user?.id,
    teamId,
    pageSize,
  } as unknown as { userId?: string; teamId?: string });

  const websites: WebsiteRow[] = queryResult.data?.data || [];

  // Fetch stats concurrently ensuring accurate payload requirements are met
  const statsQueries = useQueries({
    queries: websites.map((website) => ({
      queryKey: ['websites:stats', { websiteId: website.id, startAt, endAt, ...filters }],
      queryFn: () => get(`/websites/${website.id}/stats`, { startAt, endAt, ...filters }) as Promise<WebsiteStatsResponse>,
    })),
  });

  // Local Sort configuration mapping
  const [localSort, setLocalSort] = useState<{ key: string; dir: string } | null>(null);
  const urlOrderBy = searchParams.get('orderBy');

  // Strip local sort priorities whenever the user falls back onto a standard database sort column
  useEffect(() => {
    if (urlOrderBy) {
      setLocalSort(null);
    }
  }, [urlOrderBy]);

  const sortedData = useMemo(() => {
    const withStats = websites.map((website, index) => {
      const stats = statsQueries[index]?.data;
      return {
        ...website,
        visitors: stats?.visitors || 0,
        pageviews: stats?.pageviews || 0,
      };
    });

    // If metric sorting is active, hijack the mapping array
    if (localSort?.key) {
      return withStats.sort((a, b) => {
        const valA = Number(a[localSort.key as keyof typeof a] || 0);
        const valB = Number(b[localSort.key as keyof typeof b] || 0);
        return localSort.dir === 'desc' ? valB - valA : valA - valB;
      });
    }

    // Default to the original order supplied by the backend table sort
    return withStats;
  }, [websites, statsQueries, localSort]);

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value);
    setPageSize(newSize);
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', newSize.toString());
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleMetricSort = (key: string) => {
    setLocalSort((prev) => ({
      key,
      dir: prev?.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
    
    // De-sync backend sort if it was previously established
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
          value={pageSize}
          onChange={handlePageSizeChange}
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
      <DataGrid query={queryResult} allowSearch allowPaging>
        {() => (
          <WebsitesTable
            data={sortedData}
            showActions={showActions}
            allowEdit={allowEdit}
            allowView={allowView}
            renderLink={renderLink}
            localSort={localSort}
            onMetricSort={handleMetricSort}
          />
        )}
      </DataGrid>
    </>
  );
}
