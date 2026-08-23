import type { ValveRecord, ValveInsert, ValveType } from '@/shared/types/valve-record';

export const VALVE_TYPE_OPTIONS: ValveType[] = ['제수밸브', '소화전', '공기밸브'];

export const VALVE_TYPE_LABEL: Record<ValveType, string> = {
  제수밸브: '제수(이토)밸브',
  소화전: '소화전',
  공기밸브: '공기밸브',
};

export const HYDRANT_TYPE_OPTIONS = ['지하식', '지상쌍구', '기타'];
export const SLUICE_VALVE_FORM_OPTIONS = ['GV', 'BV', '글로브', '볼밸브', '기타'];
export const AIR_VALVE_FORM_OPTIONS = ['단구', '쌍구', '기능성밸브', '기타'];
export const VALVE_MATERIAL_OPTIONS = ['주철', 'STS', '확인불가', '기타'];
export const DRIVE_METHOD_OPTIONS = ['수동', '자동'];
export const OPEN_CLOSE_OPTIONS = ['OPEN', 'CLOSE', '확인불가'];

// ─── "기타" 직접입력 옵션 공용 파서 ───────────────────────────────────────────

function initSelectWithCustom(val: string | null, options: string[]) {
  if (!val) return { select: '', custom: '' };
  const known = options.filter((o) => o !== '기타');
  if (known.includes(val)) return { select: val, custom: '' };
  return { select: '기타', custom: val };
}

export function resolveSelectWithCustom(select: string, custom: string): string | null {
  if (!select) return null;
  if (select === '기타') return custom || null;
  return select;
}

export function getValveFormOptions(valveType: ValveType): string[] {
  return valveType === '공기밸브' ? AIR_VALVE_FORM_OPTIONS : SLUICE_VALVE_FORM_OPTIONS;
}

// ─── 보호통규격 / 철개규격 ("Φ" 접두 조합) ────────────────────────────────────

export function parseProtectionPipeSpec(val: string | null): { unknown: boolean; number: string } {
  if (!val) return { unknown: false, number: '' };
  if (val === '확인불가') return { unknown: true, number: '' };
  const m = val.match(/^Φ(.+)$/);
  return { unknown: false, number: m ? m[1] : val };
}

export function buildProtectionPipeSpec(unknown: boolean, number: string): string | null {
  if (unknown) return '확인불가';
  const trimmed = number.trim();
  return trimmed ? `Φ${trimmed}` : null;
}

export function parseCoverSpec(val: string | null): string {
  if (!val) return '';
  const m = val.match(/^Φ(.+)$/);
  return m ? m[1] : val;
}

export function buildCoverSpec(number: string): string | null {
  const trimmed = number.trim();
  return trimmed ? `Φ${trimmed}` : null;
}

// ─── ValveMapView ────────────────────────────────────────────────────────────

export type ValveMapMarker = ValveRecord;

// ─── ValveFormModal ──────────────────────────────────────────────────────────

export type ValveEditFormValues = {
  hydrantTypeSelect: string;
  hydrantTypeCustom: string;
  valveFormSelect: string;
  valveFormCustom: string;
  valveMaterialSelect: string;
  valveMaterialCustom: string;
  protectionPipeUnknown: boolean;
  protectionPipeNumber: string;
  coverSpecNumber: string;
  values: Partial<ValveInsert>;
};

export function mapToEditFormValues(r: ValveRecord): ValveEditFormValues {
  const hydrantType = initSelectWithCustom(r.hydrant_type, HYDRANT_TYPE_OPTIONS);
  const valveForm = initSelectWithCustom(r.valve_form, getValveFormOptions(r.valve_type));
  const valveMaterial = initSelectWithCustom(r.valve_material, VALVE_MATERIAL_OPTIONS);
  const protectionPipe = parseProtectionPipeSpec(r.protection_pipe_spec);

  return {
    hydrantTypeSelect: hydrantType.select,
    hydrantTypeCustom: hydrantType.custom,
    valveFormSelect: valveForm.select,
    valveFormCustom: valveForm.custom,
    valveMaterialSelect: valveMaterial.select,
    valveMaterialCustom: valveMaterial.custom,
    protectionPipeUnknown: protectionPipe.unknown,
    protectionPipeNumber: protectionPipe.number,
    coverSpecNumber: parseCoverSpec(r.cover_spec),
    values: {
      block: r.block,
      old_address: r.old_address,
      road_address: r.road_address,
      lat: r.lat,
      lng: r.lng,
      valve_type: r.valve_type,
      valve_no: r.valve_no,
      hydrant_diameter: r.hydrant_diameter,
      hydrant_valve_diameter: r.hydrant_valve_diameter,
      valve_diameter: r.valve_diameter,
      note: r.note,
      open_close: r.open_close,
      drive_method: r.drive_method,
      issue: r.issue,
      valve_room_spec: r.valve_room_spec,
      valve_room_depth: r.valve_room_depth,
    },
  };
}

export function mapToCreateFormValues(
  block: string,
  oldAddress: string | null,
  roadAddress: string | null,
  lat: number,
  lng: number,
): ValveEditFormValues {
  return {
    hydrantTypeSelect: '',
    hydrantTypeCustom: '',
    valveFormSelect: '',
    valveFormCustom: '',
    valveMaterialSelect: '',
    valveMaterialCustom: '',
    protectionPipeUnknown: false,
    protectionPipeNumber: '',
    coverSpecNumber: '',
    values: {
      block,
      old_address: oldAddress,
      road_address: roadAddress,
      lat,
      lng,
      valve_type: '제수밸브',
      valve_no: null,
      hydrant_diameter: null,
      hydrant_valve_diameter: null,
      valve_diameter: null,
      note: null,
      open_close: null,
      drive_method: null,
      issue: null,
      valve_room_spec: null,
      valve_room_depth: null,
    },
  };
}
