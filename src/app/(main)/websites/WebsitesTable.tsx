import { DataColumn, DataTable, type DataTableProps, Icon, Text } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { LinkButton } from '@/components/common/LinkButton';
import { SortableLabel } from '@/components/common/SortableLabel';
import { useMessages, useNavigation } from '@/components/hooks';
import { useWebsiteStatsQuery } from '@/components/hooks/useWebsiteStatsQuery';
import { SquarePen } from '@/components/icons';

export interface WebsiteRow {
  id: string;
  name: string;
  domain: string;
  createdAt: string | Date;
}

export interface WebsitesTableProps extends DataTableProps {
  showActions?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  renderLink?: (row: WebsiteRow) => ReactNode;
}

function MetricCell({ websiteId, metric }: { websiteId: string; metric: 'pageviews' | 'visitors' }) {
  const { data, isLoading, error } = useWebsiteStatsQuery({ websiteId });

  if (isLoading) {
    return <Text color="muted">...</Text>;
  }

  if (error) {
    return <Text color="muted">-</Text>;
  }

  return <Text>{data?.[metric]?.toLocaleString() || 0}</Text>;
}

export function WebsitesTable({ showActions, renderLink, ...props }: WebsitesTableProps) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();

  return (
    <DataTable {...props}>
      <DataColumn id="name" label={<SortableLabel label={t(labels.name)} sortKey="name" />}>
        {(row: WebsiteRow) => (renderLink ? renderLink(row) : null)}
      </DataColumn>
      <DataColumn id="domain" label={<SortableLabel label={t(labels.domain)} sortKey="domain" />} />
      <DataColumn id="visitors" label={<SortableLabel label={t(labels.visitors) || 'Visitors'} sortKey="visitors" />}>
        {(row: WebsiteRow) => <MetricCell websiteId={row.id} metric="visitors" />}
      </DataColumn>
      <DataColumn id="pageviews" label={<SortableLabel label={t(labels.pageviews) || 'Pageviews'} sortKey="pageviews" />}>
        {(row: WebsiteRow) => <MetricCell websiteId={row.id} metric="pageviews" />}
      </DataColumn>
      <DataColumn
        id="created"
        label={
          <SortableLabel label={t(labels.created)} sortKey="createdAt" defaultDirection="desc" />
        }
        width="200px"
      >
        {(row: WebsiteRow) => <DateDistance date={new Date(row.createdAt)} />}
      </DataColumn>
      {showActions && (
        <DataColumn id="action" label=" " align="end">
          {(row: WebsiteRow) => {
            const websiteId = row.id;

            return (
              <LinkButton href={renderUrl(`/websites/${websiteId}/settings`)} variant="quiet">
                <Icon>
                  <SquarePen />
                </Icon>
              </LinkButton>
            );
          }}
        </DataColumn>
      )}
    </DataTable>
  );
}
