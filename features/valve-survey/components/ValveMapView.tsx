'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LocateFixed, RefreshCw, X, Check } from 'lucide-react';
import { getValveRecordsForMap } from '@/features/valve-survey/api/actions';
import { getBlockList } from '@/features/meter-survey/api/actions';
import { VALVE_TYPE_LABEL } from '@/features/valve-survey/types/mappers';
import type { ValveRecord, ValveType } from '@/shared/types/valve-record';
import ValveFormModal from './ValveFormModal';

declare global {
  interface Window { naver: any; }
}

const VALVE_COLOR: Record<ValveType, string> = {
  제수밸브: '#22D3EE',
  소화전: '#ef4444',
  공기밸브: '#a78bfa',
};

function naverMaps() {
  return window.naver?.maps ?? null;
}

type PendingClick = {
  lat: number;
  lng: number;
  oldAddress: string | null;
  roadAddress: string | null;
};

export default function ValveMapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const activeMarkers = useRef<Map<number, any>>(new Map());
  const userMarker = useRef<any>(null);
  const clickMarker = useRef<any>(null);

  const [records, setRecords] = useState<ValveRecord[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [editingRecord, setEditingRecord] = useState<ValveRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [clickPoint, setClickPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState<PendingClick | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Naver Maps SDK 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (naverMaps()) { setSdkReady(true); return; }

    (window as any).__naverMapReadyValve = () => setSdkReady(true);

    if (!document.querySelector('script[data-naver-maps]')) {
      const script = document.createElement('script');
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_CLIENT_ID}&callback=__naverMapReadyValve`;
      script.setAttribute('data-naver-maps', '');
      document.head.appendChild(script);
    }

    const poll = setInterval(() => {
      if (naverMaps()) { setSdkReady(true); clearInterval(poll); }
    }, 150);
    return () => clearInterval(poll);
  }, []);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => { locateUser(); }, [locateUser]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const data = await getValveRecordsForMap();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { getBlockList().then(setBlocks); }, []);

  // 지도 초기화
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapRef.current || mapInstance.current) return;
    const center = userPos
      ? new nm.LatLng(userPos.lat, userPos.lng)
      : new nm.LatLng(37.5665, 126.9780);
    mapInstance.current = new nm.Map(mapRef.current, {
      center,
      zoom: 17,
      mapTypeId: 'normal',
    });
  }, [sdkReady, userPos]);

  useEffect(() => {
    const nm = naverMaps();
    if (!nm || !mapInstance.current || !userPos) return;
    mapInstance.current.setCenter(new nm.LatLng(userPos.lat, userPos.lng));
  }, [userPos]);

  // 내 위치 마커
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapInstance.current || !userPos) return;
    if (userMarker.current) userMarker.current.setMap(null);
    userMarker.current = new nm.Marker({
      position: new nm.LatLng(userPos.lat, userPos.lng),
      map: mapInstance.current,
      icon: {
        content: '<div style="width:18px;height:18px;background:#60a5fa;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(96,165,250,0.35);"></div>',
        anchor: new nm.Point(9, 9),
      },
      zIndex: 200,
    });
  }, [sdkReady, userPos]);

  // 밸브 마커 렌더링
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapInstance.current) return;

    activeMarkers.current.forEach((m) => m.setMap(null));
    activeMarkers.current.clear();

    records.forEach((r) => {
      if (r.lat == null || r.lng == null) return;
      const color = VALVE_COLOR[r.valve_type];
      const marker = new nm.Marker({
        position: new nm.LatLng(r.lat, r.lng),
        map: mapInstance.current,
        icon: {
          content: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid rgba(0,0,0,0.4);cursor:pointer;"></div>`,
          anchor: new nm.Point(7, 7),
        },
        zIndex: 100,
      });
      nm.Event.addListener(marker, 'click', () => setEditingRecord(r));
      activeMarkers.current.set(r.id, marker);
    });
  }, [sdkReady, records]);

  // 지도 클릭 → 리버스 지오코딩
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapInstance.current) return;

    const listener = nm.Event.addListener(mapInstance.current, 'click', async (e: any) => {
      const lat = e.coord.lat();
      const lng = e.coord.lng();

      setGeocodeError(null);
      setPending(null);
      setClickPoint({ lat, lng });

      if (clickMarker.current) clickMarker.current.setMap(null);
      clickMarker.current = new nm.Marker({
        position: new nm.LatLng(lat, lng),
        map: mapInstance.current,
        icon: {
          content: '<div style="width:16px;height:16px;background:#fbbf24;border-radius:50%;border:2px solid white;box-shadow:0 0 0 3px rgba(251,191,36,0.4);"></div>',
          anchor: new nm.Point(8, 8),
        },
        zIndex: 300,
      });

      try {
        const res = await fetch('/admin/api/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          throw new Error([j.error, j.detail].filter(Boolean).join(' — ') || '주소를 확인할 수 없습니다');
        }
        const { oldAddress, roadAddress } = (await res.json()) as { oldAddress: string | null; roadAddress: string | null };
        setPending({ lat, lng, oldAddress, roadAddress });
      } catch (err) {
        setGeocodeError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => nm.Event.removeListener(listener);
  }, [sdkReady]);

  function clearClick() {
    setClickPoint(null);
    setPending(null);
    setGeocodeError(null);
    if (clickMarker.current) { clickMarker.current.setMap(null); clickMarker.current = null; }
  }

  function confirmClick() {
    setCreating(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 범례 */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-text-secondary tabular-nums">
          밸브 <span className="text-text-primary font-semibold">{records.length}</span>개
        </span>
        <div className="ml-auto flex items-center gap-3">
          {(Object.keys(VALVE_COLOR) as ValveType[]).map((t) => (
            <span key={t} className="flex items-center gap-1 text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: VALVE_COLOR[t] }} />
              {VALVE_TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      </div>

      {/* 지도 */}
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: '65dvh' }}>
        {(loading || !sdkReady) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface/90">
            <RefreshCw size={20} className="animate-spin text-text-secondary" />
            {!sdkReady && <p className="text-xs text-text-secondary">지도 로딩 중...</p>}
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
        <button
          onClick={locateUser}
          disabled={locating}
          className="absolute bottom-4 right-4 z-10 p-2.5 bg-surface/90 border border-border text-text-secondary hover:text-text-primary rounded-xl transition-colors disabled:opacity-50"
          title="내 위치로 이동"
        >
          <LocateFixed size={16} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* 클릭 위치 주소 확인 바텀시트 */}
      {clickPoint && !creating && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={clearClick}
        >
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-t-2xl p-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-text-primary">클릭한 위치의 주소</span>
              <button onClick={clearClick} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
                <X size={16} />
              </button>
            </div>

            {geocodeError ? (
              <p className="text-sm text-red-500 mb-3">{geocodeError}</p>
            ) : !pending ? (
              <div className="flex items-center gap-2 text-text-secondary text-sm mb-3">
                <RefreshCw size={14} className="animate-spin" />
                주소 확인 중...
              </div>
            ) : (
              <div className="space-y-1.5 mb-3">
                <p className="text-xs text-text-secondary">구주소 <span className="text-text-primary">{pending.oldAddress ?? '확인 불가'}</span></p>
                <p className="text-xs text-text-secondary">도로명주소 <span className="text-text-primary">{pending.roadAddress ?? '확인 불가'}</span></p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={clearClick}
                className="flex-1 py-2.5 text-sm text-text-secondary hover:text-text-primary bg-background hover:bg-border/60 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmClick}
                disabled={!pending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-accent text-white dark:text-zinc-950 hover:opacity-90 rounded-lg disabled:opacity-50 transition-opacity"
              >
                <Check size={15} />
                주소 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && pending && (
        <ValveFormModal
          mode="create"
          oldAddress={pending.oldAddress}
          roadAddress={pending.roadAddress}
          lat={pending.lat}
          lng={pending.lng}
          blocks={blocks}
          onClose={() => { setCreating(false); clearClick(); }}
          onSaved={async () => {
            setCreating(false);
            clearClick();
            await loadRecords();
          }}
        />
      )}

      {editingRecord && (
        <ValveFormModal
          mode="edit"
          record={editingRecord}
          blocks={blocks}
          onClose={() => setEditingRecord(null)}
          onSaved={async () => {
            setEditingRecord(null);
            await loadRecords();
          }}
        />
      )}
    </div>
  );
}
