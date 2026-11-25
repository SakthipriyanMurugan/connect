from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, or_, desc

from app.models.base import (
    Call as CallModel,
    CallParticipant as CallParticipantModel,
    CallEvent as CallEventModel,
    UserCallSetting as UserCallSettingModel,
    CallNotification as CallNotificationModel,
    User as UserModel
)

class CallingService:
    @staticmethod
    async def create_call(
        db: AsyncSession,
        call_id: str,
        caller_id: str,
        call_type: str = "video",
        target_user_id: Optional[str] = None
    ) -> CallModel:
        now = datetime.utcnow()
        existing_res = await db.execute(select(CallModel).where(CallModel.id == call_id))
        existing_call = existing_res.scalar_one_or_none()
        if existing_call:
            return existing_call

        new_call = CallModel(
            id=call_id,
            caller_id=caller_id,
            call_type=call_type,
            call_status="ringing" if target_user_id else "active",
            started_at=now,
            created_at=now
        )
        db.add(new_call)

        # Add caller as first participant
        caller_part = CallParticipantModel(
            call_id=call_id,
            user_id=caller_id,
            joined_at=now,
            participant_status="joined"
        )
        db.add(caller_part)

        # If 1-to-1 call, add target participant as invited/ringing
        if target_user_id:
            target_part = CallParticipantModel(
                call_id=call_id,
                user_id=target_user_id,
                joined_at=now,
                participant_status="ringing"
            )
            db.add(target_part)

        # Log call initiate event
        event = CallEventModel(
            call_id=call_id,
            event_type="call_initiated",
            user_id=caller_id,
            created_at=now
        )
        db.add(event)

        await db.commit()
        await db.refresh(new_call)
        return new_call

    @staticmethod
    async def respond_to_call(
        db: AsyncSession,
        call_id: str,
        user_id: str,
        accepted: bool
    ) -> Optional[CallModel]:
        stmt = select(CallModel).where(CallModel.id == call_id)
        res = await db.execute(stmt)
        call = res.scalar_one_or_none()
        if not call:
            return None

        now = datetime.utcnow()
        if accepted:
            call.call_status = "active"
            call.answered_at = now
            # Update participant status
            part_stmt = update(CallParticipantModel).where(
                and_(CallParticipantModel.call_id == call_id, CallParticipantModel.user_id == user_id)
            ).values(participant_status="joined", joined_at=now)
            await db.execute(part_stmt)
            event_type = "call_accepted"
        else:
            call.call_status = "rejected"
            call.ended_at = now
            part_stmt = update(CallParticipantModel).where(
                and_(CallParticipantModel.call_id == call_id, CallParticipantModel.user_id == user_id)
            ).values(participant_status="rejected", left_at=now)
            await db.execute(part_stmt)
            event_type = "call_rejected"

        event = CallEventModel(
            call_id=call_id,
            event_type=event_type,
            user_id=user_id,
            created_at=now
        )
        db.add(event)
        await db.commit()
        await db.refresh(call)
        return call

    @staticmethod
    async def end_call(
        db: AsyncSession,
        call_id: str,
        user_id: str,
        duration_seconds: int = 0
    ) -> Optional[CallModel]:
        stmt = select(CallModel).where(CallModel.id == call_id)
        res = await db.execute(stmt)
        call = res.scalar_one_or_none()
        if not call:
            return None

        now = datetime.utcnow()
        call.call_status = "ended"
        call.ended_at = now
        call.duration = duration_seconds

        # Update all participant leave timestamps
        part_stmt = update(CallParticipantModel).where(
            and_(CallParticipantModel.call_id == call_id, CallParticipantModel.left_at.is_(None))
        ).values(participant_status="left", left_at=now)
        await db.execute(part_stmt)

        # Log end event
        event = CallEventModel(
            call_id=call_id,
            event_type="call_ended",
            user_id=user_id,
            created_at=now
        )
        db.add(event)

        await db.commit()
        await db.refresh(call)
        return call

    @staticmethod
    async def record_missed_call(
        db: AsyncSession,
        call_id: str,
        caller_id: str,
        target_user_id: str
    ):
        now = datetime.utcnow()
        stmt = select(CallModel).where(CallModel.id == call_id)
        res = await db.execute(stmt)
        call = res.scalar_one_or_none()
        if call:
            call.call_status = "missed"
            call.ended_at = now

        # Add notification for target user
        notif = CallNotificationModel(
            user_id=target_user_id,
            call_id=call_id,
            notification_type="missed",
            is_read=False,
            created_at=now
        )
        db.add(notif)
        await db.commit()

    @staticmethod
    async def get_call_history(
        db: AsyncSession,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        # Fetch calls where user is caller or participant
        stmt = select(CallModel).where(
            or_(
                CallModel.caller_id == user_id,
                CallModel.id.in_(
                    select(CallParticipantModel.call_id).where(CallParticipantModel.user_id == user_id)
                )
            )
        ).order_by(desc(CallModel.created_at)).limit(limit)

        res = await db.execute(stmt)
        calls = res.scalars().all()
        history = []

        for c in calls:
            # Find the other participant in 1-to-1 calls
            part_stmt = select(UserModel).where(
                and_(
                    UserModel.id != user_id,
                    UserModel.id.in_(
                        select(CallParticipantModel.user_id).where(CallParticipantModel.call_id == c.id)
                    )
                )
            ).limit(1)
            p_res = await db.execute(part_stmt)
            partner = p_res.scalar_one_or_none()

            # If partner not in participant table, check caller
            if not partner and c.caller_id != user_id:
                c_stmt = select(UserModel).where(UserModel.id == c.caller_id)
                c_res = await db.execute(c_stmt)
                partner = c_res.scalar_one_or_none()

            is_caller = (c.caller_id == user_id)
            history.append({
                "id": c.id,
                "call_type": c.call_type,
                "call_status": c.call_status,
                "duration": c.duration or 0,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "ended_at": c.ended_at.isoformat() if c.ended_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "is_caller": is_caller,
                "partner_id": partner.id if partner else None,
                "partner_name": partner.name if partner else "Teammate",
                "partner_connect_id": partner.connect_id if partner else "",
                "partner_avatar": partner.avatar if partner else "",
            })

        return history

    @staticmethod
    async def get_call_settings(db: AsyncSession, user_id: str) -> Dict[str, Any]:
        stmt = select(UserCallSettingModel).where(UserCallSettingModel.user_id == user_id)
        res = await db.execute(stmt)
        setting = res.scalar_one_or_none()
        if not setting:
            return {
                "user_id": user_id,
                "allow_voice_calls": True,
                "allow_video_calls": True,
                "notification_enabled": True,
                "privacy_settings": {}
            }
        return {
            "user_id": user_id,
            "allow_voice_calls": setting.allow_voice_calls,
            "allow_video_calls": setting.allow_video_calls,
            "notification_enabled": setting.notification_enabled,
            "privacy_settings": setting.privacy_settings or {}
        }

    @staticmethod
    async def update_call_settings(
        db: AsyncSession,
        user_id: str,
        allow_voice: Optional[bool] = None,
        allow_video: Optional[bool] = None,
        notifications: Optional[bool] = None,
        privacy: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        stmt = select(UserCallSettingModel).where(UserCallSettingModel.user_id == user_id)
        res = await db.execute(stmt)
        setting = res.scalar_one_or_none()

        if not setting:
            setting = UserCallSettingModel(
                user_id=user_id,
                allow_voice_calls=allow_voice if allow_voice is not None else True,
                allow_video_calls=allow_video if allow_video is not None else True,
                notification_enabled=notifications if notifications is not None else True,
                privacy_settings=privacy or {}
            )
            db.add(setting)
        else:
            if allow_voice is not None:
                setting.allow_voice_calls = allow_voice
            if allow_video is not None:
                setting.allow_video_calls = allow_video
            if notifications is not None:
                setting.notification_enabled = notifications
            if privacy is not None:
                setting.privacy_settings = privacy

        await db.commit()
        await db.refresh(setting)
        return {
            "user_id": user_id,
            "allow_voice_calls": setting.allow_voice_calls,
            "allow_video_calls": setting.allow_video_calls,
            "notification_enabled": setting.notification_enabled,
            "privacy_settings": setting.privacy_settings
        }
