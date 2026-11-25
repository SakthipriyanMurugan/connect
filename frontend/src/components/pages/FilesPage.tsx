import React, { useState, useEffect } from 'react';
import { FileText, Upload, HardDrive, Download, Trash2, FolderPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { sanitizeMediaUrl } from '../chat/VoiceNotePlayer';

interface FilesPageProps {
  onShowToast: (msg: string) => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  date: string;
  sharedBy: string;
  type: string;
  file_url?: string;
}

export const FilesPage: React.FC<FilesPageProps> = ({ onShowToast }) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const loadFiles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/files/list`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setFiles(data);
        }
      }
    } catch (e) {
      console.warn('Failed to load files', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUploadReal = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      onShowToast(`Uploading ${file.name}...`);
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/files/upload?user_id=${encodeURIComponent(user?.id || '')}&shared_by=${encodeURIComponent(user?.name || 'You')}`,
          { method: 'POST', body: formData }
        );
        if (res.ok) {
          const uploaded = await res.json();
          const newFile: UploadedFile = {
            id: uploaded.id || 'f-' + Date.now(),
            name: uploaded.file_name || file.name,
            size: uploaded.file_size || '1 KB',
            date: new Date().toISOString(),
            sharedBy: user?.name || 'You',
            type: (uploaded.file_name || file.name).split('.').pop() || 'doc',
            file_url: uploaded.file_url,
          };
          setFiles((prev) => [newFile, ...prev]);
          onShowToast(`Uploaded ${newFile.name} successfully!`);
        } else {
          const err = await res.json().catch(() => ({}));
          onShowToast(err.detail || 'Upload failed');
        }
      } catch {
        onShowToast('Upload failed. Check connection.');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onShowToast(`Removed ${fileName}`);
    try {
      await fetch(`${API_BASE_URL}/api/v1/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    } catch {}
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff] tracking-tight">
            Shared Documents & Recordings
          </h1>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
            S3-compatible object storage with access control and retention policies.
          </p>
        </div>
        <button
          type="button"
          disabled={isUploading}
          onClick={handleUploadReal}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-60"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
        </button>
      </div>

      {/* Storage Quota Card */}
      <div className="glass-panel p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#eaf3ff] dark:bg-[#2876ed]/20 text-[#2876ed] flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] block">
              Free Cloud Storage Quota (0 Cost Strategy)
            </b>
            <span className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc]">
              {files.length > 0 ? `${files.length} file(s) stored` : '0 MB used'} of 10.00 GB available (Cloudflare KV / D1 Vault)
            </span>
          </div>
        </div>
        <div className="w-full sm:w-48 h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#22b9ca] to-[#7a7cff] w-[1%]" />
        </div>
      </div>

      {/* Files Table or Clean Empty State */}
      {isLoading ? (
        <div className="glass-panel p-12 text-center text-xs text-[#6f7899] dark:text-[#aeb8dc]">
          Loading shared files...
        </div>
      ) : files.length === 0 ? (
        <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-[#718bff]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <FolderPlus className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
            No files uploaded yet
          </h3>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] max-w-sm mb-5">
            Store documents, audio call recordings, or presentations securely with zero egress charges.
          </p>
          <button
            type="button"
            disabled={isUploading}
            onClick={handleUploadReal}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] shadow-md cursor-pointer disabled:opacity-60"
          >
            Upload First File
          </button>
        </div>
      ) : (
        <div className="glass-panel p-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/10 text-[#6f7899] dark:text-[#aeb8dc]">
                <th className="pb-3 font-semibold">File Name</th>
                <th className="pb-3 font-semibold">Size</th>
                <th className="pb-3 font-semibold">Shared By</th>
                <th className="pb-3 font-semibold">Uploaded</th>
                <th className="pb-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {files.map((file) => {
                const href = file.file_url ? sanitizeMediaUrl(file.file_url) : '';
                const formattedDate = file.date && file.date.includes('T')
                  ? new Date(file.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                  : file.date;
                return (
                <tr key={file.id} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                  <td className="py-3.5 pr-4 flex items-center gap-2.5 font-bold text-[#182044] dark:text-[#f1f3ff]">
                    <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="truncate max-w-[280px]">{file.name}</span>
                  </td>
                  <td className="py-3.5 pr-4 text-[#6f7899] dark:text-[#aeb8dc]">{file.size}</td>
                  <td className="py-3.5 pr-4 font-medium text-[#182044] dark:text-[#eef1ff]">{file.sharedBy}</td>
                  <td className="py-3.5 pr-4 text-[#6f7899] dark:text-[#aeb8dc]">{formattedDate}</td>
                  <td className="py-3.5 text-right space-x-2">
                    {href ? (
                      <a
                        href={href}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onShowToast(`Downloading ${file.name}`)}
                        className="p-1 text-[var(--accent)] hover:opacity-80 inline-block"
                        title="Download"
                      >
                        <Download className="w-4 h-4 inline" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onShowToast('Download URL unavailable for this legacy file')}
                        className="p-1 text-[#9aa5be] inline-block cursor-not-allowed"
                        title="Download unavailable"
                      >
                        <Download className="w-4 h-4 inline" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.id, file.name)}
                      className="p-1 text-[#f04454] hover:opacity-80 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
