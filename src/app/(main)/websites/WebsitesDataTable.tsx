'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon, Row, Text } from '@umami/react-zen';
import { useQueries } from '@tanstack/react-query';
import { DataGrid } from '@/components/common/DataGrid';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation, useUserWebsitesQuery, useApi } from '@/components/hooks';
import { Favicon } from '@/index';
import { WebsitesTable, type WebsiteRow } from './WebsitesTable';

interface WebsiteStatsResponse {
  visitors: number;
  pageviews: number;
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
  const pageSize = Number(searchParams.get('pageSize')) || 50;

  const { user } = useLoginQuery();
  const queryResult = useUserWebsitesQuery({ userId: userId || user?.id, teamId });
  const { renderUrl } = useNavigation();
  const { get } = useApi();

  const websites: WebsiteRow[] = queryResult.data?.data || [];

  // Fetch stats concurrently for all websites currently rendered on the page.
  // Explicitly typing the Promise ensures 'visitors' and 'pageviews' are recognized.
  const statsQueries = useQueries({
    queries: websites.map((website) => ({
      queryKey: ['websites:stats', { websiteId: website.id }],
      queryFn: () => get(`/websites/${website.id}/stats`) as Promise<WebsiteStatsResponse>,
    })),
  });

  const [localSort, setLocalSort] = useState({ key: 'visitors', dir: 'desc' });

  // Merge the fetched query states and sort them locally if a metric is targeted
  const sortedData = useMemo(() => {
    const withStats = websites.map((website, index) => {
      const stats = statsQueries[index]?.data;
      return {
        ...website,
        visitors: stats?.visitors || 0,
        pageviews: stats?.pageviews || 0,
      };
    });

    if (localSort.key) {
      return withStats.sort((a, b) => {
        const valA = Number(a[localSort.key as keyof typeof a] || 0);
        const valB = Number(b[localSort.key as keyof typeof b] || 0);
        return localSort.dir === 'desc' ? valB - valA : valA - valB;
      });
    }
    
    return withStats;
  }, [websites, statsQueries, localSort]);

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', e.target.value);
    params.set('page', '1'); // Reset to the first page when limits change
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleMetricSort = (key: string) => {
    setLocalSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
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
      {/* Pass the untouched queryResult to DataGrid to satisfy UseQueryResult typings, 
          but override the rendered 'data' with our custom sorted array. */}
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
