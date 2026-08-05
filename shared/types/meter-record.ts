export type MeterRecord = {
  id: number;
  block: string;
  row_no: string | null;
  name: string | null;
  address: string | null;
  old_meter_number: string | null;
  meter_number: string | null;
  reading: string | null;
  sealed: string | null;
  location: string | null;
  usage_type: string | null;
  floor: string | null;
  note: string | null;
  survey_date: string | null;
  cover_type: string | null;
  water_supply_type: string | null;
  meter_condition: string | null;
  image1_id: string | null;
  image2_id: string | null;
  image3_id: string | null;
  image4_id: string | null;
  manufacturer: string | null;
  relocation_needed: string | null;
  replacement_needed: string | null;
  water_tank_capacity: string | null;
  water_pressure: string | null;
  meter_type: string | null;
  reading_method: string | null;
  final_reading: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type MeterInsert = Omit<MeterRecord, 'id' | 'created_at'>;

export type MeterStatus = 'processed' | 'unprocessed' | 'closed';

// 처리 완료 판정: 6개 필드 전부 not null (또는 note가 '호폐'/'위치불명'/'적재'인 종결 처리)
export function getMeterStatus(
  r: Pick<MeterRecord, 'note' | 'meter_number' | 'reading' | 'sealed' | 'location' | 'usage_type' | 'floor'>,
): MeterStatus {
  if (r.note === '호폐' || r.note === '위치불명' || r.note === '적재') return 'closed';
  if (r.meter_number && r.reading && r.sealed && r.location && r.usage_type && r.floor) return 'processed';
  return 'unprocessed';
}
