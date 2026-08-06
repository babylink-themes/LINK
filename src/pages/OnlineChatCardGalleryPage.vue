<template>
  <section class="screen no-tabs online-card-gallery-page">
    <header class="online-card-gallery-topbar">
      <button type="button" aria-label="返回" @click="goBack"><ChevronLeft :size="22" /></button>
      <span>
        <small>LINK DESIGN LAB</small>
        <strong>聊天与守护图鉴</strong>
      </span>
      <i aria-hidden="true"><Sparkles :size="18" /></i>
    </header>

    <main class="online-card-gallery-content">
      <section class="online-card-gallery-hero">
        <span>SOFT NOTE COLLECTION</span>
        <h1>在线聊天与守护<br />全部示例</h1>
        <p>从消息卡片到角色唯一 LifeLedger 的授权镜像；预览内容不写入数据，也不会调用 API。</p>
      </section>

      <section class="online-card-gallery-section" aria-label="MCP 动态卡片示例">
        <header><span>01 · MCP 动态</span><small>连接进度与行动回执</small></header>
        <article class="online-card-gallery-message">
          <span class="online-card-gallery-avatar">M</span>
          <OnlineChatCard kind="mcp-operation" :mcp-operations="mcpOperationSample" />
        </article>
      </section>

      <section class="online-card-gallery-section" aria-label="MCP 结构化结果卡片示例">
        <header><span>02 · MCP 结果</span><small>网页、地点、内容与好物</small></header>
        <article class="online-card-gallery-message">
          <span class="online-card-gallery-avatar">M</span>
          <OnlineChatCard kind="mcp-result" :mcp-result="mcpResultSample" />
        </article>
      </section>

      <section class="online-card-gallery-section" aria-label="链接分享卡片示例">
        <header><span>03 · 链接分享</span><small>内容、视频、好物与网页</small></header>
        <article v-for="share in shareSamples" :key="share.platform" class="online-card-gallery-message">
          <span class="online-card-gallery-avatar">M</span>
          <OnlineChatCard kind="link-preview" :link="share" :caption="share.caption" />
        </article>
      </section>

      <section class="online-card-gallery-section" aria-label="情侣守护完整预览">
        <header><span>04 · 情侣守护</span><small>唯一 LifeLedger 的授权镜像</small></header>
        <article class="guardian-gallery-chat-preview">
          <div class="guardian-gallery-status"><span>♡</span><div><small>情侣守护 · 48% · 充电中</small><strong>月光工作室 · 正在整理照片</strong></div><em>查看</em></div>
          <div class="guardian-gallery-event"><header><span>♡</span><div><small>COUPLE GUARDIAN</small><strong>晚上的生活动态</strong></div><em>3 条</em></header><p>收到 LINK 消息后打开了手机，回复完正在等照片导出。</p><footer><span>48% · 充电中</span><span>月光工作室</span><b>查看详情 ›</b></footer></div>
        </article>
        <article class="guardian-gallery-panel">
          <CoupleGuardianPanel conversation-id="guardian-preview" :character="guardianPreviewCharacter" />
        </article>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, Sparkles } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import OnlineChatCard from '@/components/chat/OnlineChatCard.vue';
import CoupleGuardianPanel from '@/components/chat/CoupleGuardianPanel.vue';
import type { CharacterProfile, ChatLinkPreviewAttachment, ChatMcpOperation, ChatMcpResultAttachment, CoupleSpaceSnapshot, LifeLedgerEvent } from '@/types/domain';
import { defaultProfileAvatar } from '@/utils/profile';

type ShareSample = Pick<ChatLinkPreviewAttachment, 'platform' | 'url' | 'title' | 'description' | 'siteName'> & { caption?: string };

const router = useRouter();

const mcpOperationSample: ChatMcpOperation[] = [
  {
    id: 'gallery-mcp-status',
    serverId: 'reality',
    serverName: '养崽助手',
    toolName: 'get_status',
    toolRef: 'get_status',
    arguments: {},
    result: '已找到毛毛的最新状态',
    state: 'completed',
    requestedAt: Date.now() - 1_400,
    completedAt: Date.now()
  },
  {
    id: 'gallery-mcp-search',
    serverId: 'search',
    serverName: '心愿清单',
    toolName: 'find_nearby',
    toolRef: 'find_nearby',
    arguments: {},
    result: '正在挑选适合一起去的地方',
    state: 'running',
    requestedAt: Date.now()
  }
];

const mcpResultSample: ChatMcpResultAttachment = {
  serverId: 'lifestyle-search',
  serverName: '周末灵感',
  toolName: 'little_plan',
  items: [
    { kind: 'place', title: '月亮湾植物咖啡', description: '午后的光线很温柔，适合慢慢聊天。', distance: '1.2 km', eta: '步行 16 分钟' },
    { kind: 'media', title: '奶油云朵蛋糕的做法', description: '收藏量很高的周末甜品视频。', source: '视频推荐', url: 'https://example.com/video' },
    { kind: 'product', title: '奶白色郁金香花束', description: '今天下单，傍晚可以送到。', price: '¥79 起', source: '好物推荐', url: 'https://example.com/product' },
    { kind: 'link', title: '城市公园夏日市集', description: '本周六日限定开放，手作摊位很多。', source: '网页内容', url: 'https://example.com/market' }
  ]
};

const shareSamples: ShareSample[] = [
  {
    platform: 'xiaohongshu',
    url: 'https://www.xiaohongshu.com/',
    title: '夏日约会穿搭｜奶油色很显温柔',
    description: '看到这套的时候，第一反应就是想分享给你。',
    siteName: '小红书',
    caption: '这个配色好像很适合你。'
  },
  {
    platform: 'douyin',
    url: 'https://www.douyin.com/',
    title: '下雨天也要去吃热乎乎的拉面',
    description: '收藏下来，下次一起去试试吧。',
    siteName: '抖音'
  },
  {
    platform: 'taobao',
    url: 'https://www.taobao.com/',
    title: '复古小熊马克杯 · 米白色',
    description: '早上喝咖啡的时候会不会很可爱？',
    siteName: '淘宝'
  },
  {
    platform: 'website',
    url: 'https://example.com/',
    title: '今晚的月亮和你的晚安',
    description: '一篇想留给我们慢慢读完的小文章。',
    siteName: 'LINK 小剧场'
  }
];

const oneDayMs = 24 * 60 * 60 * 1000;

const guardianPreviewSnapshot: CoupleSpaceSnapshot = {
  id: 'guardian-preview-snapshot',
  generatedAt: Date.now() - 2 * 60_000,
  location: { place: '月光工作室', address: '旧街二层靠窗的位置', status: '正在整理今天拍下的照片', distance: '离你不远', transport: '步行', eta: '照片导出后回家', stayMinutes: 42, route: [] },
  device: {
    battery: 48, charging: true, screenStatus: 'using', lastUnlockedAt: '20:41', lastLockedAt: '20:36', usageMinutes: 214, activeApp: 'LINK', network: '月光工作室 Wi-Fi', networkHistory: [{ name: '地铁 5G', time: '18:22', kind: 'cellular' }, { name: '月光工作室 Wi-Fi', time: '18:46', kind: 'wifi' }],
    appUsage: [
      { app: 'LINK', minutes: 24, lastUsedAt: '20:41', detail: '回复消息后顺手看了一会儿照片' },
      { app: '相册', minutes: 31, lastUsedAt: '20:34', detail: '挑出傍晚的几张街景' },
      { app: '地图', minutes: 18, lastUsedAt: '18:39', detail: '确认去工作室的换乘路线' },
      { app: '音乐', minutes: 46, lastUsedAt: '19:17', detail: '整理照片时循环播放的歌单' }
    ],
    notifications: [
      { app: 'LINK', time: '20:39', title: 'Linker 发来一条消息', preview: '照片导出了吗？', unread: false },
      { app: '同学群', time: '20:25', title: '阿栀：周末的展览还去吗', preview: '我把预约链接发群里了', unread: true },
      { app: '外卖', time: '19:51', title: '取餐提醒', preview: '热可可已送达前台', unread: false }
    ],
    chats: [
      { contact: '阿栀', relation: '大学同学', avatarEmoji: '🪻', updatedAt: '20:25', unread: 1, summary: '在商量周末去看一个小型摄影展。', messages: [{ sender: 'contact', time: '20:24', text: '周末的展览还去吗？' }, { sender: 'character', time: '20:25', text: '去，我整理完照片就看预约。' }] },
      { contact: '林老师', relation: '合作导师', avatarEmoji: '📎', updatedAt: '17:42', unread: 0, summary: '确认明天下午的修改稿时间。', messages: [{ sender: 'character', time: '17:39', text: '我会把第二版一起带过去。' }, { sender: 'contact', time: '17:42', text: '好，明天下午见。' }] }
    ],
    footprints: [{ kind: 'map', time: '18:21', title: '月光工作室', detail: '确认末班地铁前的步行距离。', reason: '怕整理照片太晚' }, { kind: 'shopping', time: '19:43', title: '热可可 · 少糖', detail: '下单了一杯热饮。', reason: '想暖暖手再继续修图' }],
    gallery: [{ time: '19:12', title: '窗边的蓝色影子', detail: '路过旧街时随手拍下的玻璃反光。', emoji: '📷', palette: ['#d8e5fa', '#f2d3e0'] }, { time: '20:16', title: '还没选好的那张', detail: '想留给晚点再分享的照片。', emoji: '🌙', palette: ['#d7dcfb', '#c9edf0'] }],
    notes: [{ folder: '随手记', title: '明天要带的东西', content: '修改稿、充电线、那张洗出来的照片。', updatedAt: '18:07', pinned: true }, { folder: '灵感', title: '展览的标题备选', content: '把平常的光收集起来。', updatedAt: '20:11', pinned: false }],
    lifeRecords: [{ kind: 'calendar', time: '明天 14:00', title: '修改稿讨论', detail: '和林老师确认第二版。', status: '已安排' }, { kind: 'music', time: '19:17', title: '《晚风收件箱》', detail: '今晚整理照片时循环播放。', status: '播放中' }]
  },
  bond: { mood: '安静又有点想分享', moodEmoji: '☾', missLevel: 72, syncScore: 88, nextPlan: '照片导出后发一张给你', whisper: '把好看的光先替你存下来。', daySummary: '今天从地铁出来后去工作室整理了照片，给自己点了一杯热饮，也和同学约好了周末的展览。', hiddenThought: '其实第一张选出来时就想立刻发给你。', keywords: ['旧街', '热可可', '照片', '展览'] },
  moments: [{ time: '18:14', category: '下班路上', title: '买了一束小雏菊', detail: '路过花摊时觉得颜色很像傍晚。', emoji: '🌼', unspoken: '想问你会不会也喜欢。' }, { time: '19:51', category: '休息', title: '取到热可可', detail: '杯套上写着“慢一点也没关系”。', emoji: '☕', unspoken: '' }]
};

const guardianPreviewEvents: LifeLedgerEvent[] = [
  { id: 'preview-home', occurredAt: Date.now() - 11 * 60 * 60_000, kind: 'location', source: 'life-advance', importance: 'quiet', title: '从家出发', summary: '带着相机出门。', detail: '出门前确认了相机电池。', icon: '⌖', location: '家', activityCategory: 'home' },
  { id: 'preview-metro', occurredAt: Date.now() - 3 * 60 * 60_000, kind: 'travel', source: 'life-advance', importance: 'notice', title: '搭上地铁', summary: '在地铁上看了一会儿地图。', detail: '正在前往旧街。', icon: '↝', location: '地铁 2 号线', activityCategory: 'travel' },
  { id: 'preview-studio', occurredAt: Date.now() - 2 * 60 * 60_000, kind: 'location', source: 'life-advance', importance: 'notice', title: '到达月光工作室', summary: '开始整理今天拍下的照片。', detail: '把相机里的照片导进电脑。', icon: '⌖', location: '月光工作室', activityCategory: 'work' },
  { id: 'preview-charge', occurredAt: Date.now() - 38 * 60_000, kind: 'charge', source: 'life-advance', importance: 'notice', title: '插上充电线', summary: '电量降到一半后开始充电。', detail: '等照片导出时顺便给手机充电。', icon: '⚡', battery: 48, charging: true, location: '月光工作室', activityCategory: 'work' },
  { id: 'preview-notice', occurredAt: Date.now() - 5 * 60_000, kind: 'message-received', source: 'private-chat', importance: 'notice', title: '收到 LINK 消息', summary: 'Linker 问照片是否已经导出。', detail: '照片导出了吗？', icon: '✦', app: 'LINK', location: '月光工作室', activityCategory: 'work' },
  { id: 'preview-reply', occurredAt: Date.now() - 2 * 60_000, kind: 'message-sent', source: 'private-chat', importance: 'highlight', title: '打开 LINK 回复', summary: '回复后回到照片整理。', detail: '快好了，选一张给你看。', icon: '↗', app: 'LINK', location: '月光工作室', activityCategory: 'work' }
];

const guardianPreviewCharacter: CharacterProfile = {
  id: 'guardian-preview-character', nickname: '望舒', name: '望舒', avatar: defaultProfileAvatar, description: '喜欢记录日常光线的摄影师。', signature: '把平常的光收集起来。', userNote: '', boundUserId: 'guardian-preview-user', subtitle: '摄影师', lastSeen: '', localWorldBookIds: [], voomFrequency: 'medium',
  coupleSpace: { consentGrantedAt: Date.now() - oneDayMs, relationshipLabel: '恋人', startedAt: '', arrivalReminderEnabled: true, enabled: true, activityFeedEnabled: true, history: [], wishes: [], life: { lastAdvancedAt: Date.now() - 2 * 60_000, events: [] } },
  lifeLedger: { id: 'guardian-preview-ledger', characterId: 'guardian-preview-character', createdAt: Date.now() - oneDayMs, updatedAt: Date.now() - 2 * 60_000, lastAdvancedAt: Date.now() - 2 * 60_000, contentAdvanceCount: 6, current: guardianPreviewSnapshot, events: guardianPreviewEvents }
};

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.push({ name: 'home' });
}
</script>

<style scoped>
.online-card-gallery-page {
  overflow: auto;
  background:
    radial-gradient(circle at 0 0, rgba(255, 222, 232, 0.68), transparent 32%),
    radial-gradient(circle at 100% 16%, rgba(224, 240, 229, 0.7), transparent 26%),
    linear-gradient(180deg, #fffdfd, #f8f6f5 48%, #f4f5f1);
}

.online-card-gallery-topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
  min-height: calc(56px + var(--safe-top));
  padding: calc(var(--safe-top) + 8px) 16px 8px;
  background: rgba(255, 253, 253, 0.72);
  backdrop-filter: blur(16px);
}

.online-card-gallery-topbar button,
.online-card-gallery-topbar > i {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: #6d646a;
  box-shadow: 0 7px 16px rgba(103, 79, 89, 0.08);
}

.online-card-gallery-topbar > i {
  color: #c5819b;
  font-style: normal;
}

.online-card-gallery-topbar span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.online-card-gallery-topbar small {
  color: #ae8f9a;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.online-card-gallery-topbar strong {
  color: #39343a;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.025em;
}

.online-card-gallery-content {
  display: grid;
  gap: 22px;
  min-height: calc(var(--app-height) - 56px - var(--safe-top));
  padding: 16px 16px calc(32px + var(--safe-bottom));
}

.online-card-gallery-hero {
  display: grid;
  gap: 7px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 28px;
  background:
    radial-gradient(circle at 90% 12%, rgba(221, 240, 227, 0.88), transparent 31%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(253, 241, 246, 0.8));
  box-shadow: 0 19px 38px rgba(85, 66, 74, 0.08);
}

.online-card-gallery-hero > span,
.online-card-gallery-section > header > span {
  color: #b17d92;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.online-card-gallery-hero h1,
.online-card-gallery-hero p {
  margin: 0;
}

.online-card-gallery-hero h1 {
  color: #3b3439;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.055em;
  line-height: 1.22;
}

.online-card-gallery-hero p {
  max-width: 290px;
  color: #81787e;
  font-size: 10px;
  font-weight: 650;
  line-height: 1.6;
}

.online-card-gallery-section {
  display: grid;
  gap: 9px;
}

.online-card-gallery-section > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}

.online-card-gallery-section > header > small {
  color: #9c9499;
  font-size: 8px;
  font-weight: 700;
  text-align: right;
}

.online-card-gallery-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.online-card-gallery-avatar {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-top: 4px;
  border: 2px solid rgba(255, 255, 255, 0.82);
  border-radius: 50%;
  background: linear-gradient(145deg, #f2d8e3, #e7efe7);
  color: #8d7480;
  font-family: Georgia, serif;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 6px 12px rgba(89, 72, 80, 0.08);
}

.online-card-gallery-message :deep(.online-chat-card) {
  flex: 0 1 264px;
  max-width: calc(100% - 36px);
}

.guardian-gallery-chat-preview {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 19px;
  background: linear-gradient(145deg, rgba(246, 240, 247, 0.94), rgba(240, 244, 250, 0.94));
}

.guardian-gallery-status,
.guardian-gallery-event header,
.guardian-gallery-event footer {
  display: flex;
  align-items: center;
}

.guardian-gallery-status {
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid rgba(222, 152, 183, 0.16);
  border-radius: 14px;
  background: linear-gradient(110deg, #fff4f8, #f4f0ff);
}

.guardian-gallery-status > span,
.guardian-gallery-event header > span {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  color: #d35f88;
  font-size: 18px;
  background: rgba(255, 255, 255, 0.86);
}

.guardian-gallery-status div,
.guardian-gallery-event header div { display: grid; min-width: 0; gap: 1px; }
.guardian-gallery-status small,
.guardian-gallery-event header small { overflow: hidden; color: #af8296; font-size: 8px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.guardian-gallery-status strong,
.guardian-gallery-event header strong { overflow: hidden; color: #624d59; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.guardian-gallery-status em,
.guardian-gallery-event header em { flex: none; margin-left: auto; padding: 3px 5px; border-radius: 6px; color: #b26082; font-size: 7px; font-style: normal; background: rgba(255, 255, 255, 0.72); }
.guardian-gallery-event { display: grid; gap: 7px; padding: 12px; border: 1px solid rgba(215, 138, 173, 0.26); border-radius: 17px; background: linear-gradient(135deg, #fff7fa, #f5f1ff); box-shadow: 0 6px 16px rgba(114, 79, 98, 0.09); }
.guardian-gallery-event header { gap: 7px; }.guardian-gallery-event p { margin: 0; color: #806a76; font-size: 9px; line-height: 1.5; }.guardian-gallery-event footer { gap: 4px; padding-top: 7px; border-top: 1px solid rgba(204, 163, 183, 0.25); }.guardian-gallery-event footer span { overflow: hidden; padding: 2px 5px; border-radius: 5px; color: #967687; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; background: rgba(255, 255, 255, 0.65); }.guardian-gallery-event footer b { margin-left: auto; color: #c05d84; font-size: 8px; }
.guardian-gallery-panel { overflow: hidden; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.82); border-radius: 23px; background: #fffdfd; box-shadow: 0 16px 32px rgba(95, 73, 86, 0.08); }
</style>