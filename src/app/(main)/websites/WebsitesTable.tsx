import { DataColumn, DataTable, type DataTableProps, Icon, Text } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { LinkButton } from '@/components/common/LinkButton';
import { SortableLabel } from '@/components/common/SortableLabel';
import { useMessages, useNavigation } from '@/components/hooks';
import { SquarePen } from '@/components/icons';

export interface WebsiteRow {
  id: string;
  name: string;
  domain: string;
  createdAt: string | Date;
  visitors?: number;
  pageviews?: number;
}

export interface WebsitesTableProps extends DataTableProps {
  showActions?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  renderLink?: (row: WebsiteRow) => ReactNode;
  localSort?: { key: string; dir: string } | null;
  onMetricSort?: (key: string) => void;
}

export function WebsitesTable({
  showActions,
  renderLink,
  localSort,
  onMetricSort,
  ...props
}: WebsitesTableProps) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();

  const renderSortableMetricHeader = (label: string, key: string) => {
    const isSorted = localSort?.key === key;
    return (
      <div
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}
        onClick={() => onMetricSort?.(key)}
      >
        {label}
        {isSorted && (
          <span style={{ fontSize: '0.8em' }}>{localSort.dir === 'desc' ? '▼' : '▲'}</span>
        )}
      </div>
    );
  };

  return (
    <DataTable {...props}>
      <DataColumn id="name" label={<SortableLabel label={t(labels.name)} sortKey="name" />}>
        {(row: WebsiteRow) => (renderLink ? renderLink(row) : null)}
      </DataColumn>
      <DataColumn id="domain" label={<SortableLabel label={t(labels.domain)} sortKey="domain" />} />
      <DataColumn
        id="visitors"
        label={renderSortableMetricHeader(t(labels.visitors) || 'Visitors', 'visitors')}
      >
        {(row: WebsiteRow) => <Text>{row.visitors?.toLocaleString() || 0}</Text>}
      </DataColumn>
      <DataColumn
        id="pageviews"
        label={renderSortableMetricHeader(t(labels.pageviews) || 'Pageviews', 'pageviews')}
      >
        {(row: WebsiteRow) => <Text>{row.pageviews?.toLocaleString() || 0}</Text>}
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
