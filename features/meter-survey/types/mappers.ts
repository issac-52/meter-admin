import { type MeterRecord, type MeterInsert, type MeterStatus, getMeterStatus } from '@/shared/types/meter-record';

export type { MeterStatus };
export { getMeterStatus };

// 지역(region)에 배정되지 않은 블록만 보기 위한 가상 지역 ID
export const UNASSIGNED_REGION_ID = '__unassigned__';

// ─── MeterTable ──────────────────────────────────────────────────────────────

export type MeterTableRow = MeterRecord & {
  status: MeterStatus;
  imageCount: number;
};

export function mapToTableRow(r: MeterRecord): MeterTableRow {
  return {
    ...r,
    status: getMeterStatus(r),
    imageCount: [r.image1_id, r.image2_id, r.image3_id, r.image4_id].filter(Boolean).length,
  };
}

// ─── MeterMapView ────────────────────────────────────────────────────────────

export type MeterMapMarker = MeterRecord & {
  status: MeterStatus;
};

export function mapToMapMarker(r: MeterRecord): MeterMapMarker {
  return { ...r, status: getMeterStatus(r) };
}

// ─── MeterEditModal ──────────────────────────────────────────────────────────

export const USAGE_TYPES = ['가정집', '상가', '주상복합', '빌라', '공공기관', '기타'];
export const LOCATION_DETAIL_OPTIONS = ['건물앞', '건물뒤', '건물좌', '건물우', '입구좌', '입구우', '대문좌측', '대문우측', '기타'];

function parseLocationInit(val: string | null) {
  if (!val) return { inOut: '' as '' | '옥내' | '옥외', detail: '', custom: '' };
  const m = val.match(/^(옥내|옥외)\((.+)\)$/);
  if (m) {
    const known = LOCATION_DETAIL_OPTIONS.slice(0, -1);
    const detail = m[2];
    if (known.includes(detail)) return { inOut: m[1] as '옥내' | '옥외', detail, custom: '' };
    return { inOut: m[1] as '옥내' | '옥외', detail: '기타', custom: detail };
  }
  return { inOut: '' as '' | '옥내' | '옥외', detail: '기타', custom: val };
}

function initUsageSelect(val: string | null) {
  if (!val) return '';
  if (USAGE_TYPES.slice(0, -1).includes(val)) return val;
  return '기타';
}

function initUsageCustom(val: string | null) {
  if (!val) return '';
  if (USAGE_TYPES.slice(0, -1).includes(val)) return '';
  return val;
}

function nowString() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type EditFormValues = {
  meterSame: boolean;
  usageTypeSelect: string;
  usageTypeCustom: string;
  locationInOut: '' | '옥내' | '옥외';
  locationDetail: string;
  locationCustom: string;
  values: Partial<MeterInsert>;
};

export function mapToEditFormValues(r: MeterRecord): EditFormValues {
  const initLoc = parseLocationInit(r.location);
  return {
    meterSame: !!r.old_meter_number && r.meter_number === r.old_meter_number,
    usageTypeSelect: initUsageSelect(r.usage_type),
    usageTypeCustom: initUsageCustom(r.usage_type),
    locationInOut: initLoc.inOut,
    locationDetail: initLoc.detail,
    locationCustom: initLoc.custom,
    values: {
      meter_number: r.meter_number,
      reading: r.reading,
      sealed: r.sealed ?? '봉인',
      usage_type: r.usage_type,
      floor: r.floor,
      note: r.note,
      survey_date: nowString(),
      cover_type: r.cover_type ?? '',
      water_supply_type: r.water_supply_type ?? null,
      meter_condition: r.meter_condition ?? null,
      manufacturer: r.manufacturer ?? null,
      relocation_needed: r.relocation_needed ?? null,
      replacement_needed: r.replacement_needed ?? null,
      water_tank_capacity: r.water_tank_capacity ?? null,
      water_pressure: r.water_pressure ?? null,
      meter_type: r.meter_type ?? null,
      reading_method: r.reading_method ?? null,
    },
  };
}
