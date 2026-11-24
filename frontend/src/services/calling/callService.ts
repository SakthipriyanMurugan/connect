import { API_BASE_URL } from '../../config/api';

export interface CallHistoryItem {
  id: string;
  call_type: 'voice' | 'video' | 'group';
  call_status: 'initiated' | 'ringing' | 'accepted' | 'rejected' | 'missed' | 'busy' | 'ended' | 'failed';
  duration: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  is_caller: boolean;
  partner_id?: string;
  partner_name?: string;
  partner_connect_id?: string;
  partner_avatar?: string;
}

export interface UserCallSettings {
  user_id: string;
  allow_voice_calls: boolean;
  allow_video_calls: boolean;
  notification_enabled: boolean;
  privacy_settings?: Record<string, any>;
}

export const callService = {
  /**
   * Initiate a call session in the database
   */
  async initiateCall(
    callerId: string,
    targetUserId?: string,
    callType: 'voice' | 'video' | 'group' = 'video',
    roomName?: string,
    title?: string
  ) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_id: callerId,
          target_user_id: targetUserId,
          call_type: callType,
          room_name: roomName,
          title: title || 'Call',
        }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Initiate call API warning:', e);
    }
    return null;
  },

  /**
   * Respond to call (accept or reject)
   */
  async respondCall(callId: string, userId: string, accepted: boolean) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callId,
          user_id: userId,
          accepted,
        }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Respond call API warning:', e);
    }
    return null;
  },

  /**
   * End call and record duration
   */
  async endCall(callId: string, userId: string, durationSeconds: number) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callId,
          user_id: userId,
          duration_seconds: durationSeconds,
        }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('End call API warning:', e);
    }
    return null;
  },

  /**
   * Fetch call history
   */
  async getCallHistory(userId: string): Promise<CallHistoryItem[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/history?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.warn('Get call history API warning:', e);
    }
    return [];
  },

  /**
   * Fetch user call settings
   */
  async getCallSettings(userId: string): Promise<UserCallSettings | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/settings?user_id=${userId}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Get call settings API warning:', e);
    }
    return null;
  },

  /**
   * Update user call settings
   */
  async updateCallSettings(settings: Partial<UserCallSettings> & { user_id: string }) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/calls/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Update call settings API warning:', e);
    }
    return null;
  },
};
