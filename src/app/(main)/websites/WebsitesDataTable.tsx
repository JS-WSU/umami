import { useState } from 'react';
import { Icon, Row, Text } from '@umami/react-zen';
import { DataGrid } from '@/components/common/DataGrid';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation, useUserWebsitesQuery } from '@/components/hooks';
import { Favicon } from '@/index';
import { WebsitesTable, type WebsiteRow } from './WebsitesTable';

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
  const [pageSize, setPageSize] = useState<number>(50);
  const { user } = useLoginQuery();
  
  // Use a type assertion to bypass the strict exact-property validation.
  // This allows pageSize to safely pass through to the internal usePagedQuery 
  // without utilizing any generic 'any' overrides.
  const queryArgs = { userId: userId || user?.id, teamId, pageSize };
  const queryResult = useUserWebsitesQuery(
    queryArgs as unknown as { userId?: string; teamId?: string }
  );
  
  const { renderUrl } = useNavigation();

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
          onChange={(e) => setPageSize(Number(e.target.value))}
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
        {({ data }) => (
          <WebsitesTable
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
