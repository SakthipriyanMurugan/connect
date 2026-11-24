import React, { useState, useEffect } from 'react';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  X,
  Clock,
  Calendar,
  Loader2,
} from 'lucide-react';
import { callService, CallHistoryItem } from '../../services/calling/callService';

interface CallHistoryModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onRedial: (name: string, callType: 'video' | 'audio', targetUserId?: string, targetConnectId?: string) => void;
}

export const CallHistoryModal: React.FC<CallHistoryModalProps> = ({
  userId,
  isOpen,
  onClose,
  onRedial,
}) => {
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      setIsLoading(true);
      callService.getCallHistory(userId).then((items) => {
        setHistory(items);
        setIsLoading(false);
      });
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const filtered = filter === 'missed'
    ? history.filter((h) => h.call_status === 'missed' || h.call_status === 'rejected')
    : history;

  const formatDuration = (secs: number) => {
    if (!secs) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Recent';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="font-bold text-base text-slate-900">Call History</h3>
            <p className="text-xs text-slate-500">View recent WhatsApp-style voice and video calls</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-slate-100 px-4 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            All Calls ({history.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('missed')}
            className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer ${
              filter === 'missed'
                ? 'text-rose-600 border-b-2 border-rose-600'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            Missed Calls
          </button>
        </div>

        {/* Call Log List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mb-2" />
              <span className="text-xs">Loading call history...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              {filter === 'missed' ? 'No missed calls recorded.' : 'No call history yet. Start a call from any chat!'}
            </div>
          ) : (
            filtered.map((item) => {
              const isMissed = item.call_status === 'missed' || item.call_status === 'rejected';
              const isOutgoing = item.is_caller;

              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status Icon */}
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isMissed
                          ? 'bg-rose-50 text-rose-600'
                          : isOutgoing
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {isMissed ? (
                        <PhoneMissed className="w-5 h-5" />
                      ) : isOutgoing ? (
                        <PhoneOutgoing className="w-5 h-5" />
                      ) : (
                        <PhoneIncoming className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <b className={`text-xs sm:text-sm font-bold block truncate ${isMissed ? 'text-rose-600' : 'text-slate-900'}`}>
                        {item.partner_name || 'Teammate'}
                      </b>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        {item.partner_connect_id && (
                          <span className="text-blue-600 font-semibold">@{item.partner_connect_id}</span>
                        )}
                        <span>•</span>
                        <span>{formatDate(item.created_at || item.started_at)}</span>
                        {item.duration > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-500">{formatDuration(item.duration)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Redial Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRedial(
                          item.partner_name || 'Teammate',
                          'audio',
                          item.partner_id,
                          item.partner_connect_id
                        );
                      }}
                      title="Redial Voice Call"
                      className="p-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRedial(
                          item.partner_name || 'Teammate',
                          'video',
                          item.partner_id,
                          item.partner_connect_id
                        );
                      }}
                      title="Redial Video Call"
                      className="p-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
