import React, { useMemo, useState } from 'react';
import { FileCode2, FolderOpen, Search, X } from 'lucide-react';
import type { SupportedLanguage } from '../core/types';

export interface ProjectFile {
  path: string;
  name: string;
  dir: string;
  content: string;
  language: SupportedLanguage;
  lines: number;
}

interface FolderExplorerProps {
  folderName: string;
  files: ProjectFile[];
  activeFilePath: string | null;
  skippedCount: number;
  onSelectFile: (path: string) => void;
  onCloseFolder: () => void;
}

const LANG_BADGE_COLOR: Record<SupportedLanguage, string> = {
  typescript: '#38bdf8',
  javascript: '#fbbf24',
  python: '#6ee7b7',
};

const LANG_SHORT: Record<SupportedLanguage, string> = {
  typescript: 'TS',
  javascript: 'JS',
  python: 'PY',
};

export const FolderExplorer: React.FC<FolderExplorerProps> = ({
  folderName,
  files,
  activeFilePath,
  skippedCount,
  onSelectFile,
  onCloseFolder,
}) => {
  const [query, setQuery] = useState('');

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, query]);

  return (
    <aside className="folder-sidebar">
      <div className="folder-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <FolderOpen size={15} color="#818cf8" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="folder-title" title={folderName}>
              {folderName}
            </div>
            <div className="folder-meta">
              {files.length} ไฟล์โค้ด{skippedCount > 0 ? ` • ข้าม ${skippedCount}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          style={{ padding: '4px 6px' }}
          onClick={onCloseFolder}
          title="ปิดโฟลเดอร์"
        >
          <X size={13} />
        </button>
      </div>

      <div className="folder-search">
        <Search size={13} color="#64748b" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาไฟล์..."
        />
      </div>

      <div className="folder-list">
        {filteredFiles.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            ไม่พบไฟล์ที่ตรงกับคำค้นหา
          </div>
        ) : (
          filteredFiles.map((f) => {
            const isActive = f.path === activeFilePath;
            return (
              <button
                key={f.path}
                type="button"
                className={`folder-file-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectFile(f.path)}
                title={f.path}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <FileCode2 size={13} color={LANG_BADGE_COLOR[f.language]} style={{ flexShrink: 0 }} />
                  <span className="folder-file-name">{f.name}</span>
                  <span
                    className="folder-lang-tag"
                    style={{ color: LANG_BADGE_COLOR[f.language] }}
                  >
                    {LANG_SHORT[f.language]}
                  </span>
                </div>
                {f.dir && <div className="folder-file-dir">{f.dir}</div>}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
