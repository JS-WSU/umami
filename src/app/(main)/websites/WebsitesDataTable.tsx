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

// Sub-component to safely isolate metrics fetching and client-side sorting 
// exclusively to the active paginated chunk returned by DataGrid.
function EnrichedWebsitesTable({ data = [], ...props }: any) {
  const { get } = useApi();
  const { startAt, endAt } = useDateParameters();
  const filters = useFilterParameters();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

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

  // Fetch stats concurrently strictly for the active page slice
  const statsQueries = useQueries({
    queries: data.map((website: any) => ({
      queryKey: ['websites:stats', { websiteId: website.id, startAt, endAt, ...filters }],
      queryFn: () => get(`/websites/${website.id}/stats`, { startAt, endAt, ...filters }) as Promise<WebsiteStatsResponse>,
    })),
  });

  const sortedPageData = useMemo(() => {
    const enriched = data.map((website: any, index: number) => {
      const stats = statsQueries[index]?.data;
      return {
        ...website,
        visitors: stats?.visitors || 0,
        pageviews: stats?.pageviews || 0,
      };
    });

    if (localSort?.key) {
      return enriched.sort((a: any, b: any) => {
        const valA = Number(a[localSort.key] || 0);
        const valB = Number(b[localSort.key] || 0);
        return localSort.dir === 'desc' ? valB - valA : valA - valB;
      });
    }

    return enriched;
  }, [data, statsQueries, localSort]);

  const handleMetricSort = (key: string) => {
    setLocalSort((prev) => ({
      key,
      dir: prev?.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
    
    // De-sync backend sort if previously established
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('orderBy')) {
      params.delete('orderBy');
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  return (
    <WebsitesTable
      {...props}
      data={sortedPageData}
      localSort={localSort}
      onMetricSort={handleMetricSort}
    />
  );
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

  // Read pageSize cleanly from the URL 
  const urlPageSize = searchParams.get('pageSize');
  const pageSize = urlPageSize ? Number(urlPageSize) : 10;

  const { user } = useLoginQuery();
  const { renderUrl } = useNavigation();

  // Let usePagedQuery inherently extract pageSize and page from the URL. Do not force params.
  const queryResult = useUserWebsitesQuery({
    userId: userId || user?.id,
    teamId,
  });

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', e.target.value); // Use 'pageSize' precisely as the backend expects
    params.set('page', '1'); // Reset to the first page when limits change
    router.push(`${pathname}?${params.toString()}`);
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
      
      {/* Pass untouched queryResult to DataGrid to perfectly preserve internal pagination mappings */}
      <DataGrid query={queryResult} allowSearch allowPaging>
        {({ data }) => (
          <EnrichedWebsitesTable
            data={data}
            showActions={showActions}
            allowEdit={allowEdit}
            allowView={allowView}
            renderLink={renderLink}
          />
        )}
      </DataGrid>
    </>
  );
}
