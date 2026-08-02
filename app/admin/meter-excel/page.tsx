'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import MeterTemplateFill from '@/features/excel-manager/components/MeterTemplateFill';
import MeterExcelUpload from '@/features/excel-manager/components/MeterExcelUpload';
import MeterExcelExport from '@/features/excel-manager/components/MeterExcelExport';
import ValveExcelUpload from '@/features/valve-survey/components/ValveExcelUpload';
import ValveExcelExport from '@/features/valve-survey/components/ValveExcelExport';

type Category = 'meter' | 'valve';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'meter', label: '수용가조사' },
  { key: 'valve', label: '밸브류' },
];

export default function ExcelManagerPage() {
  const [category, setCategory] = useState<Category>('meter');
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">엑셀관리자</h1>
          <p className="text-sm text-text-secondary mt-1">DB 데이터 다운로드 및 엑셀 업로드</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white dark:text-zinc-950 font-semibold text-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          <Upload size={14} />
          엑셀 업로드
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex items-center gap-1 mb-8 bg-surface rounded-lg p-1 w-fit">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              category === c.key ? 'bg-border text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === 'meter' ? (
        <div className="space-y-8">
          <section>
            <h2 className="text-base font-semibold text-text-primary mb-1">DB 데이터 엑셀 다운로드</h2>
            <p className="text-xs text-text-secondary mb-4">DB에 저장된 모든 컬럼을 엑셀로 내려받습니다. 블록/날짜 필터 선택 가능.</p>
            <MeterExcelExport />
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-base font-semibold text-text-primary mb-1">원본 양식 채우기</h2>
            <p className="text-xs text-text-secondary mb-4">수용가조사기록지 원본 파일을 올리면 DB 데이터를 채워서 다운로드합니다.</p>
            <MeterTemplateFill />
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-base font-semibold text-text-primary mb-1">밸브 데이터 엑셀 다운로드</h2>
            <p className="text-xs text-text-secondary mb-4">DB에 저장된 밸브 데이터를 엑셀로 내려받습니다. 블록 필터 선택 가능.</p>
            <ValveExcelExport />
          </section>
        </div>
      )}

      {showUpload && (
        category === 'meter'
          ? <MeterExcelUpload onClose={() => setShowUpload(false)} />
          : <ValveExcelUpload onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
