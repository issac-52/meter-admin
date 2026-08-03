export type ValveType = '제수밸브' | '소화전' | '공기밸브';

export type ValveRecord = {
  id: number;
  block: string;
  old_address: string | null;
  road_address: string | null;
  lat: number | null;
  lng: number | null;
  valve_type: ValveType;
  survey_date: string;

  // 소화전 전용
  hydrant_diameter: string | null;
  hydrant_valve_diameter: string | null;
  hydrant_type: string | null;
  note: string | null;

  // 제수/공기밸브 공용 (open_close는 소화전과도 공용)
  open_close: string | null;
  valve_form: string | null;
  valve_material: string | null;
  drive_method: string | null;
  protection_pipe_spec: string | null;
  cover_spec: string | null;
  issue: string | null;
  valve_room_spec: string | null;
  valve_room_depth: string | null;

  // 현장 사진 (개당 2장, 블록별 폴더에 저장 — 수용가와 별개)
  image1_id: string | null;
  image2_id: string | null;

  // 엑셀 업로드 전용 (수동 입력폼에는 노출되지 않음)
  valve_no: string | null;
  map_sheet_no: string | null;
  surveyor: string | null;
  survey_date_text: string | null;
  rotation_direction: string | null;
  rotation_count: string | null;
  total_rotation_count: string | null;
  manufacturer: string | null;
  install_date: string | null;
  valve_diameter: string | null;
  valve_issue: string | null;
  related_valve_diameter: string | null;
  related_valve_open_close: string | null;
  elevation: string | null;
  pressure_location: string | null;
  pressure_elevation: string | null;
  pressure_value: string | null;
  dynamic_head: string | null;
  head_diff: string | null;
  facility_name: string | null;
  water_tower_height: string | null;

  created_at: string;
};

export type ValveInsert = Omit<ValveRecord, 'id' | 'created_at' | 'survey_date'>;
