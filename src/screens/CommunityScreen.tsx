import React, { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { HillDecoration } from '../components/Decorations';
import { SectionHeader } from '../components/SectionHeader';
import { leaderboard } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

export function CommunityScreen({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { state } = useAppStore();
  const [joinedGroups, setJoinedGroups] = useState<Record<string, boolean>>({});
  const communityProgress = 1540 / 2000;

  const toggleGroup = (key: string) => {
    setJoinedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />

      <div className="flex flex-row-reverse items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-[16px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
          <AppIcon name="community" size={24} color={colors.primary} />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <h1 dir="rtl" className="text-[#17324D] text-[24px] font-black leading-tight">
            קהילה ודירוג
          </h1>
          <p dir="rtl" className="text-[#718397] text-[13px] mt-1">
            מתקדמים יחד, בלי תחרותיות מיותרת
          </p>
        </div>
      </div>

      <Card className="min-h-[148px] p-5 flex flex-row items-center gap-4 mb-4 overflow-hidden">
        <div className="w-[88px] h-[102px] rounded-[22px] bg-[#FFF5DB] flex flex-col items-center justify-center shrink-0">
          <AppIcon name="crown" size={30} color={colors.gold} />
          <span className="text-[#17324D] text-[28px] font-black mt-0.5 leading-none">3</span>
          <span className="text-[#718397] text-[11px] font-extrabold mt-1">מקום</span>
        </div>
        <div className="flex-1 flex flex-col items-end">
          <span dir="rtl" className="text-[#718397] text-[13px] font-bold">
            הדירוג השבועי שלך
          </span>
          <span dir="rtl" className="text-[#17324D] text-[27px] font-black mt-1 leading-tight">
            {state.points.toLocaleString('he-IL')} נקודות
          </span>
          <div className="flex flex-row-reverse gap-2 mt-3 flex-wrap">
            <div className="flex flex-row-reverse items-center gap-1 px-2 py-[5px] rounded-full bg-[#F4F8FB]">
              <AppIcon name="flame" size={15} color={colors.coral} />
              <span dir="rtl" className="text-[#718397] text-[10px] font-bold">
                {state.torahStreak} ימי רצף
              </span>
            </div>
            <div className="flex flex-row-reverse items-center gap-1 px-2 py-[5px] rounded-full bg-[#F4F8FB]">
              <AppIcon name="chart" size={15} color={colors.primary} />
              <span dir="rtl" className="text-[#718397] text-[10px] font-bold">
                עלייה של מקום אחד
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="min-h-[138px] p-4 flex flex-row items-center gap-3 mb-4 overflow-hidden">
        <HillDecoration />
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              אתגר הקהילה
            </span>
            <AppIcon name="target" size={21} color={colors.teal} />
          </div>
          <span dir="rtl" className="text-[#718397] text-[13px] mt-1 text-right">
            יעד קבוצתי: 2,000 מצוות השבוע
          </span>
          <div className="w-full h-2 rounded-full bg-[#EAF0F4] overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-[#2AAE9B]"
              style={{ width: `${communityProgress * 100}%` }}
            />
          </div>
          <span className="text-[#2AAE9B] text-[11px] font-black mt-1">1,540 מתוך 2,000</span>
        </div>
      </Card>

      <Card className="p-4 mb-5">
        <SectionHeader title="המובילים השבוע" icon="trophy" actionLabel="חברים" />
        {leaderboard.map((person, index) => {
          const isMe = person.id === 'me';
          const medalColor =
            index === 0 ? 'bg-[#F6C94A]' : index === 1 ? 'bg-[#CAD3DC]' : 'bg-[#D59A63]';
          return (
            <div
              key={person.id}
              className={`min-h-[70px] flex flex-row items-center px-2 py-2 rounded-[16px] ${
                isMe ? 'bg-[#EAF4FB]' : ''
              } ${index < leaderboard.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}
            >
              <div className="w-9 flex items-center justify-center shrink-0">
                {index < 3 ? (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${medalColor}`}>
                    <span className="text-white text-[13px] font-black">{index + 1}</span>
                  </div>
                ) : (
                  <span className="text-[#718397] text-[13px] font-black">{index + 1}</span>
                )}
              </div>
              <div className="w-[62px] flex flex-col items-center shrink-0">
                <span className="text-[#17324D] text-[13px] font-black">
                  {person.points.toLocaleString('he-IL')}
                </span>
                <span className="text-[#718397] text-[9px] mt-0.5">נק׳</span>
              </div>
              <div className="flex-1 flex flex-row-reverse items-center gap-3">
                <div
                  className={`w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 ${
                    isMe ? 'bg-[#2AAE9B]' : 'bg-[#F4F8FB]'
                  }`}
                >
                  <span className={`text-[13px] font-black ${isMe ? 'text-white' : 'text-[#1B6F8F]'}`}>
                    {person.initials}
                  </span>
                </div>
                <div className="flex-1 flex flex-col items-end">
                  <span dir="rtl" className="text-[#17324D] text-[15px] font-black">
                    {person.name}
                    {isMe ? ' (אתה)' : ''}
                  </span>
                  <div className="flex flex-row-reverse items-center gap-[3px] mt-0.5">
                    <AppIcon name="flame" size={13} color={colors.coral} />
                    <span className="text-[#718397] text-[11px] font-bold">{person.streak} ימים</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      <SectionHeader title="קבוצות פעילות" icon="community" />
      <div className="flex flex-row gap-3">
        <GroupCard
          title="לומדים כל יום"
          members="286 חברים"
          icon="book"
          background={colors.purpleSoft}
          color={colors.purple}
          joined={Boolean(joinedGroups.torah)}
          onPress={() => toggleGroup('torah')}
        />
        <GroupCard
          title="מאה ברכות"
          members="412 חברים"
          icon="star"
          background={colors.mintSoft}
          color={colors.teal}
          joined={Boolean(joinedGroups.blessings)}
          onPress={() => toggleGroup('blessings')}
        />
      </div>
    </div>
  );
}

function GroupCard({
  title,
  members,
  icon,
  background,
  color,
  joined,
  onPress,
}: {
  title: string;
  members: string;
  icon: 'book' | 'star';
  background: string;
  color: string;
  joined: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex-1 min-h-[174px] rounded-[22px] bg-white border border-[#DDE8EE] flex flex-col items-center justify-center p-3 card-shadow hover:border-[#2AAE9B] transition-colors"
    >
      <div
        className="w-[50px] h-[50px] rounded-[16px] flex items-center justify-center"
        style={{ backgroundColor: background }}
      >
        <AppIcon name={icon} size={25} color={color} />
      </div>
      <span dir="rtl" className="text-[#17324D] text-[15px] font-black mt-2 text-center">
        {title}
      </span>
      <span dir="rtl" className="text-[#718397] text-[11px] mt-1">
        {members}
      </span>
      <div
        className={`mt-3 px-3 py-1.5 rounded-full ${
          joined ? 'bg-[#EAF7EF]' : 'bg-[#EAF4FB]'
        }`}
      >
        <span className={`text-[11px] font-black ${joined ? 'text-[#4DAA78]' : 'text-[#1B6F8F]'}`}>
          {joined ? 'מחובר' : 'הצטרפות'}
        </span>
      </div>
    </button>
  );
}
