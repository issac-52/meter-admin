import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import * as XLSX from 'xlsx';
import type { ValveRecord } from '@/shared/types/valve-record';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const block = searchParams.get('block');

  const admin = createAdminClient();
  const PAGE = 5000;
  const allData: ValveRecord[] = [];
  let from = 0;
  while (true) {
    let q = admin
      .from('valve_records')
      .select('*')
      .order('block', { ascending: true })
      .order('valve_no', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (block) q = q.eq('block', block);
    const { data, error } = await q;
    if (error) return new NextResponse('DB 조회 실패: ' + error.message, { status: 500 });
    const page = (data ?? []) as ValveRecord[];
    allData.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const VALVE_TYPE_LABEL: Record<string, string> = { 제수밸브: '제수(이토)밸브', 소화전: '소화전', 공기밸브: '공기밸브' };

  const rows = allData.map((r) => ({
    블록: r.block ?? '',
    밸브번호: r.valve_no ?? '',
    종류: VALVE_TYPE_LABEL[r.valve_type] ?? r.valve_type,
    구주소: r.old_address ?? '',
    도로명주소: r.road_address ?? '',
    도엽번호: r.map_sheet_no ?? '',
    위도: r.lat ?? '',
    경도: r.lng ?? '',
    구경: r.hydrant_diameter ?? r.valve_diameter ?? '',
    밸브구경: r.hydrant_valve_diameter ?? '',
    개폐여부: r.open_close ?? '',
    형식: r.valve_form ?? r.hydrant_type ?? '',
    밸브재질: r.valve_material ?? '',
    구동방법: r.drive_method ?? '',
    회전방향: r.rotation_direction ?? '',
    현회전수: r.rotation_count ?? '',
    총회전수: r.total_rotation_count ?? '',
    제작회사: r.manufacturer ?? '',
    설치일자: r.install_date ?? '',
    보호통규격: r.protection_pipe_spec ?? '',
    철개규격: r.cover_spec ?? '',
    밸브실규격: r.valve_room_spec ?? '',
    밸브실심도: r.valve_room_depth ?? '',
    표고: r.elevation ?? '',
    관련제수밸브구경: r.related_valve_diameter ?? '',
    관련제수밸브개폐여부: r.related_valve_open_close ?? '',
    수압측정위치: r.pressure_location ?? '',
    수압측정표고: r.pressure_elevation ?? '',
    수압: r.pressure_value ?? '',
    동수두: r.dynamic_head ?? '',
    차이: r.head_diff ?? '',
    시설명: r.facility_name ?? '',
    급수탑높이: r.water_tower_height ?? '',
    문제사항: r.valve_issue ?? '',
    밸브실문제사항: r.issue ?? '',
    비고: r.note ?? '',
    조사자: r.surveyor ?? '',
    조사일자: r.survey_date_text ?? r.survey_date ?? '',
    생성일: r.created_at ? r.created_at.slice(0, 10) : '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '밸브데이터');

  const buf: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const today = new Date().toISOString().slice(0, 10);
  const label = block ? `_${block}블록` : '';
  const fileName = encodeURIComponent(`밸브데이터${label}_${today}.xlsx`);

  return new NextResponse(buf.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'X-Record-Count': String(allData.length),
    },
  });
}
