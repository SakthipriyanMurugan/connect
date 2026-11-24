import React from 'react';

/**
 * SidebarChatsSkeleton
 * Rendered in the left sidebar while conversation list is loading on refresh or initial connect.
 */
export const SidebarChatsSkeleton: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="h-[74px] px-3.5 flex items-center gap-3">
          {/* Avatar shimmer */}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-200 to-slate-100 shrink-0 shadow-xs" />

          {/* Details shimmer */}
          <div className="flex-1 min-w-0 pr-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-3.5 bg-slate-200 rounded-md w-32" />
              <div className="h-2.5 bg-slate-100 rounded-md w-12" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-2.5 bg-slate-100 rounded-md w-44" />
              <div className="h-2 bg-slate-100 rounded-full w-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * ChatHeaderSkeleton
 * Rendered at the top of the chat pane while friend/group details are resolving.
 */
export const ChatHeaderSkeleton: React.FC = () => {
  return (
    <div className="h-[64px] px-4 border-b border-slate-200/80 flex items-center justify-between bg-white shrink-0 animate-pulse">
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar shimmer */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-200 to-slate-100 shrink-0 shadow-xs" />
        
        {/* Name & Handle shimmer */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-slate-200 rounded-md w-28" />
            <div className="h-3.5 bg-blue-100/70 rounded-full w-14" />
          </div>
          <div className="h-2.5 bg-slate-100 rounded-md w-20" />
        </div>
      </div>

      {/* Action buttons shimmer */}
      <div className="flex items-center gap-1.5">
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
};

/**
 * ChatMessagesSkeleton
 * Rendered in the message stream while messages are loading.
 */
export const ChatMessagesSkeleton: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 animate-pulse bg-[#f8fafc]">
      {/* Top Encryption Badge shimmer */}
      <div className="flex justify-center mb-6">
        <div className="h-6 w-64 bg-slate-200/70 rounded-full shadow-2xs" />
      </div>

      {/* Bubble 1: Incoming Left */}
      <div className="flex items-end gap-2.5 max-w-[75%] md:max-w-[60%]">
        <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
        <div className="p-3.5 rounded-2xl rounded-bl-sm bg-white border border-slate-200/80 shadow-xs space-y-2 w-56">
          <div className="h-3 bg-slate-200 rounded w-40" />
          <div className="h-2.5 bg-slate-100 rounded w-28" />
          <div className="h-2 bg-slate-100 rounded w-10 ml-auto" />
        </div>
      </div>

      {/* Bubble 2: Outgoing Right */}
      <div className="flex justify-end">
        <div className="max-w-[75%] md:max-w-[60%] p-3.5 rounded-2xl rounded-br-sm bg-blue-100/70 border border-blue-200/60 shadow-xs space-y-2 w-64">
          <div className="h-3 bg-blue-200 rounded w-48" />
          <div className="h-3 bg-blue-200 rounded w-36" />
          <div className="h-2 bg-blue-200/70 rounded w-12 ml-auto" />
        </div>
      </div>

      {/* Bubble 3: Incoming Left - Audio Note Shimmer */}
      <div className="flex items-end gap-2.5 max-w-[75%] md:max-w-[60%]">
        <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
        <div className="p-3.5 rounded-2xl rounded-bl-sm bg-white border border-slate-200/80 shadow-xs flex items-center gap-3 w-60">
          <div className="w-10 h-10 rounded-full bg-blue-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 bg-slate-200 rounded-full w-full" />
            <div className="h-2 bg-slate-100 rounded w-12" />
          </div>
        </div>
      </div>

      {/* Bubble 4: Outgoing Right */}
      <div className="flex justify-end">
        <div className="max-w-[75%] md:max-w-[60%] p-3.5 rounded-2xl rounded-br-sm bg-blue-100/70 border border-blue-200/60 shadow-xs space-y-2 w-44">
          <div className="h-3 bg-blue-200 rounded w-32" />
          <div className="h-2 bg-blue-200/70 rounded w-10 ml-auto" />
        </div>
      </div>

      {/* Bubble 5: Incoming Left - Longer message */}
      <div className="flex items-end gap-2.5 max-w-[75%] md:max-w-[60%]">
        <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
        <div className="p-3.5 rounded-2xl rounded-bl-sm bg-white border border-slate-200/80 shadow-xs space-y-2 w-72">
          <div className="h-3 bg-slate-200 rounded w-60" />
          <div className="h-3 bg-slate-200 rounded w-52" />
          <div className="h-2.5 bg-slate-100 rounded w-36" />
          <div className="h-2 bg-slate-100 rounded w-10 ml-auto" />
        </div>
      </div>
    </div>
  );
};

/**
 * FullChatPaneSkeleton
 * Used when active friend is being loaded or refreshed on desktop
 */
export const FullChatPaneSkeleton: React.FC = () => {
  return (
    <div className="hidden md:flex flex-1 flex-col bg-[#f8fafc]">
      <ChatHeaderSkeleton />
      <ChatMessagesSkeleton />
      <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-3 shrink-0 animate-pulse">
        <div className="w-10 h-10 rounded-2xl bg-slate-100" />
        <div className="w-10 h-10 rounded-2xl bg-slate-100" />
        <div className="flex-1 h-11 bg-slate-100 rounded-2xl" />
        <div className="w-11 h-11 rounded-2xl bg-blue-100" />
      </div>
    </div>
  );
};
