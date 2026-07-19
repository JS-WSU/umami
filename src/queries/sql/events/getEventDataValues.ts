import clickhouse from '@/lib/clickhouse';
import { DATA_TYPE } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getEventDataValues';

export interface WebsiteEventData {
  value: string;
  total: number;
  date?: string;
}

export type EventDataFilters = QueryFilters & {
  propertyName?: string;
  dataType?: number;
  unit?: string;
  timezone?: string;
};

export async function getEventDataValues(
  ...args: [websiteId: string, eventName: string, filters: EventDataFilters]
): Promise<WebsiteEventData[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  eventName: string,
  filters: EventDataFilters,
) {
  const { rawQuery, parseFilters, getDateSQL } = prisma;
  const { dataType, unit, timezone } = filters;
  const { filterQuery, joinSessionQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  const selectDate = unit ? `${getDateSQL('event_data.created_at', unit, timezone)} as "date",` : '';
  const groupDate = unit ? '"date", ' : '';
  const orderDate = unit ? '"date" asc, ' : '';

  if (dataType === DATA_TYPE.array) {
    return rawQuery(
      `
      select
        ${selectDate}
        array_item.value as "value",
        count(*) as "total"
      from event_data
      join website_event on website_event.event_id = event_data.website_event_id
        and website_event.website_id = {{websiteId::uuid}}
        and website_event.created_at between {{startDate}} and {{endDate}}
        and website_event.event_type = 2
        and website_event.event_name = {{eventName}}
      cross join lateral jsonb_array_elements_text(coalesce(event_data.string_value, '[]')::jsonb) as array_item(value)
      ${cohortQuery}
      ${joinSessionQuery}
      where event_data.website_id = {{websiteId::uuid}}
        and event_data.created_at between {{startDate}} and {{endDate}}
        and event_data.data_key = {{propertyName}}
        and event_data.data_type = ${DATA_TYPE.array}
      ${filterQuery}
      group by ${groupDate}array_item.value
      order by ${orderDate}2 desc
      limit 100
      `,
      { ...queryParams, eventName },
      FUNCTION_NAME,
    );
  }

  return rawQuery(
    `
    select
      ${selectDate}
      case
        when data_type = 2 then replace(string_value, '.0000', '')
        when data_type = 4 then ${getDateSQL('date_value', 'hour')}
        else string_value
      end as "value",
      count(*) as "total"
    from event_data
    join website_event on website_event.event_id = event_data.website_event_id
      and website_event.website_id = {{websiteId::uuid}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and website_event.event_type = 2
      and website_event.event_name = {{eventName}}
    ${cohortQuery}
    ${joinSessionQuery}
    where event_data.website_id = {{websiteId::uuid}}
      and event_data.created_at between {{startDate}} and {{endDate}}
      and event_data.data_key = {{propertyName}}
      ${dataType ? `and event_data.data_type = ${dataType}` : ''}
    ${filterQuery}
    group by ${groupDate}value
    order by ${orderDate}2 desc
    limit 100
    `,
    { ...queryParams, eventName },
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(
  websiteId: string,
  eventName: string,
  filters: EventDataFilters,
): Promise<WebsiteEventData[]> {
  const { rawQuery, parseFilters, getDateStringQuery } = clickhouse;
  const { dataType, unit, timezone } = filters;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  const selectDate = unit
    ? `${getDateStringQuery('event_data.created_at', unit, timezone)} as "date",`
    : '';
  const groupDate = unit ? 'date, ' : '';
  const orderDate = unit ? 'date asc, ' : '';

  if (dataType === DATA_TYPE.array) {
    return rawQuery(
      `
      select
        ${selectDate}
        arrayJoin(JSONExtract(ifNull(event_data.string_value, '[]'), 'Array(String)')) as "value",
        count(*) as "total"
      from event_data
      any left join (
            select *
            from website_event
            where website_id = {websiteId:UUID}
              and created_at between {startDate:DateTime64} and {endDate:DateTime64}
              and event_type = 2
              and event_name = {eventName:String}) website_event
      on website_event.event_id = event_data.event_id
        and website_event.session_id = event_data.session_id
        and website_event.website_id = event_data.website_id
      ${cohortQuery}
      where event_data.website_id = {websiteId:UUID}
        and event_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_data.event_name = {eventName:String}
        and event_data.data_key = {propertyName:String}
        and event_data.data_type = ${DATA_TYPE.array}
      ${filterQuery}
      group by ${groupDate}value
      order by ${orderDate}2 desc
      limit 100
      `,
      { ...queryParams, eventName },
      FUNCTION_NAME,
    );
  }

  return rawQuery(
    `
    select
      ${selectDate}
      multiIf(data_type = 2, replaceAll(string_value, '.0000', ''),
              data_type = 4, toString(date_trunc('hour', date_value)),
              string_value) as "value",
      count(*) as "total"
    from event_data
    any left join (
          select *
          from website_event
          where website_id = {websiteId:UUID}
            and created_at between {startDate:DateTime64} and {endDate:DateTime64}
            and event_type = 2
            and event_name = {eventName:String}) website_event
    on website_event.event_id = event_data.event_id
      and website_event.session_id = event_data.session_id
      and website_event.website_id = event_data.website_id
    ${cohortQuery}
    where event_data.website_id = {websiteId:UUID}
      and event_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      and event_data.event_name = {eventName:String}
      and event_data.data_key = {propertyName:String}
      ${dataType ? `and event_data.data_type = ${dataType}` : ''}
    ${filterQuery}
    group by ${groupDate}value
    order by ${orderDate}2 desc
    limit 100
    `,
    { ...queryParams, eventName },
    FUNCTION_NAME,
  );
}
