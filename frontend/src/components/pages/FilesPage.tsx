import React, { useState } from 'react';
import { FileText, Upload, HardDrive, Download, Trash2, FolderPlus } from 'lucide-react';

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
}

export const FilesPage: React.FC<FilesPageProps> = ({ onShowToast }) => {
  // Clean initial state (empty until user uploads)
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const handleUploadSim = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const sizeKb = Math.round(file.size / 1024);
        const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        const newFile: UploadedFile = {
          id: 'f-' + Date.now(),
          name: file.name,
          size: sizeStr,
          date: 'Just now',
          sharedBy: 'You',
          type: file.name.split('.').pop() || 'doc',
        };
        setFiles([newFile, ...files]);
        onShowToast(`Uploaded ${file.name} to Cloudflare R2 / MinIO storage.`);
      }
    };
    input.click();
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
          onClick={handleUploadSim}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Upload File</span>
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
              {files.length > 0 ? `${files.length} file(s) stored` : '0 MB used'} of 10.00 GB available (Cloudflare R2 Free Tier / Local MinIO)
            </span>
          </div>
        </div>
        <div className="w-full sm:w-48 h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#22b9ca] to-[#7a7cff] w-[1%]" />
        </div>
      </div>

      {/* Files Table or Clean Empty State */}
      {files.length === 0 ? (
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
            onClick={handleUploadSim}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] shadow-md"
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
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                  <td className="py-3.5 pr-4 flex items-center gap-2.5 font-bold text-[#182044] dark:text-[#f1f3ff]">
                    <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="truncate max-w-[280px]">{file.name}</span>
                  </td>
                  <td className="py-3.5 pr-4 text-[#6f7899] dark:text-[#aeb8dc]">{file.size}</td>
                  <td className="py-3.5 pr-4 font-medium text-[#182044] dark:text-[#eef1ff]">{file.sharedBy}</td>
                  <td className="py-3.5 pr-4 text-[#6f7899] dark:text-[#aeb8dc]">{file.date}</td>
                  <td className="py-3.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => onShowToast(`Downloading ${file.name}`)}
                      className="p-1 text-[var(--accent)] hover:opacity-80"
                      title="Download"
                    >
                      <Download className="w-4 h-4 inline" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles(files.filter((f) => f.id !== file.id));
                        onShowToast('File removed.');
                      }}
                      className="p-1 text-[#f04454] hover:opacity-80"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
