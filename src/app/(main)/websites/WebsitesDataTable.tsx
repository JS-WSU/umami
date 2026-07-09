import { useState } from 'react';
import { Dropdown, Icon, Item, Row, Text } from '@umami/react-zen';
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
  const [pageSize, setPageSize] = useState<number>(50); // Defaulting to 50 for large-scale views
  const { user } = useLoginQuery();
  
  // Injecting pageSize into the query variables for the API request
  const queryResult = useUserWebsitesQuery({ 
    userId: userId || user?.id, 
    teamId, 
    pageSize 
  });
  
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
      <Row justifyContent="end" paddingBottom="4">
        <Dropdown
          value={pageSize}
          onChange={(key: React.Key) => setPageSize(Number(key))}
          renderValue={(value) => <Text>Show: {value}</Text>}
        >
          <Item key="10">10</Item>
          <Item key="50">50</Item>
          <Item key="100">100</Item>
        </Dropdown>
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
