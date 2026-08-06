<template>
  <section class="our-space">
    <template v-if="!state?.consentGrantedAt">
      <section class="our-space__welcome">
        <div class="our-space__welcome-light" aria-hidden="true"></div>
        <header class="our-space__wordmark"><span>LINK</span><i></i><span>US</span></header>
        <div class="our-space__welcome-copy">
          <small>PRIVATE COUPLE SPACE</small>
          <h3>把日常，<em>收进我们的小宇宙。</em></h3>
          <p>这里保存的是 {{ characterName }} 在角色世界里持续发生的生活。只有双方同意后，才能一起翻阅。</p>
        </div>
        <div class="our-space__pair" aria-label="两人的情侣空间">
          <img :src="character.avatar" :alt="characterName" />
          <span><Heart :size="17" fill="currentColor" /></span>
          <div><small>{{ characterName }}</small><strong>&amp;</strong><small>{{ userName }}</small></div>
        </div>
        <label class="our-space__consent">
          <input v-model="consentChecked" type="checkbox" />
          <span><Check :size="14" /></span>
          <b>我确认这是双方自愿开启的互动模拟</b>
        </label>
        <button class="our-space__join" type="button" :disabled="!consentChecked" @click="enableGuardian">
          <Sparkles :size="17" />进入我们的空间
        </button>
        <p class="our-space__welcome-foot"><ShieldCheck :size="13" />不会读取真实位置、真实手机或真实联系人</p>
      </section>
    </template>

    <template v-else>
      <header class="our-space__topbar">
        <button type="button" aria-label="查看今天" @click="page = 'today'"><span class="our-space__topbar-avatar"><img :src="character.avatar" :alt="characterName" /></span></button>
        <div><small>OUR SPACE</small><strong>{{ topbarTitle }}</strong></div>
        <button class="our-space__topbar-menu" type="button" aria-label="情侣守护设置" @click="showSettings = true"><Menu :size="19" /></button>
      </header>

      <section v-if="guardianDisabled" class="our-space__first-page">
        <div class="our-space__first-page-art" aria-hidden="true"><span>o</span><i>o</i><b>Ⅱ</b></div>
        <small>OUR SPACE / PAUSED</small>
        <h3>我们的小宇宙，<em>暂时收起来了。</em></h3>
        <p>关闭期间不会请求内容模型、生成生活记录或在聊天中显示守护动态。已有历史会保留在本地。</p>
      </section>

      <section v-else-if="!snapshot" class="our-space__first-page">
        <div class="our-space__first-page-art" aria-hidden="true"><span>o</span><i>o</i><b>✦</b></div>
        <small>PAGE 01 / WAITING FOR A MOMENT</small>
        <h3>还没有今天的故事，<em>要现在开始写吗？</em></h3>
        <p>首次推进会请求内容模型，建立角色当前生活状态与第一批账本事件；无法生成时会直接报告错误。</p>
        <button type="button" :disabled="syncing" @click="syncLife"><LoaderCircle v-if="syncing" class="our-space__spin" :size="17" /><Sparkles v-else :size="17" />{{ syncing ? '正在写入' : '写下今天的第一页' }}</button>
      </section>

      <template v-else>
        <main class="our-space__content">
          <section v-if="page === 'today'" class="our-space__today">
            <header class="our-space__hero">
              <div class="our-space__hero-sky" aria-hidden="true"><i></i><b></b><em></em></div>
              <div class="our-space__hero-label"><span>오늘의 우리</span><time>{{ formatDate(snapshot.generatedAt) }}</time></div>
              <div class="our-space__hero-copy"><small>RIGHT NOW</small><h3>{{ snapshot.location.place }}</h3><p>{{ snapshot.location.status }}</p></div>
              <button type="button" :disabled="syncing" @click="syncLife"><LoaderCircle v-if="syncing" class="our-space__spin" :size="16" /><RefreshCw v-else :size="16" /><span>{{ syncing ? '同步中' : '更新此刻' }}</span></button>
            </header>

            <section class="our-space__moodline">
              <span>{{ snapshot.bond.moodEmoji }}</span>
              <p><small>{{ characterName }} 此刻</small><strong>{{ snapshot.bond.mood }}</strong></p>
              <em>{{ snapshot.device.battery }}%{{ snapshot.device.charging ? ' · 充电中' : '' }}</em>
            </section>

            <section class="our-space__diary">
              <header><div><small>OUR DAILY NOTES</small><h4>刚刚留下的日常</h4></div><span>{{ ledgerEvents.length }} 篇</span></header>
              <div v-if="ledgerEvents.length" class="our-space__diary-list">
                <button v-for="event in ledgerEvents" :key="event.id" type="button" @click="openEvent(event.id)">
                  <time>{{ formatGuardianEventTime(event.occurredAt) }}</time>
                  <span>{{ guardianEventIcon(event.kind, event.icon) }}</span>
                  <div><strong>{{ event.title }}</strong><p>{{ event.summary }}</p></div>
                  <ChevronRight :size="15" />
                </button>
              </div>
              <p v-else class="our-space__blank">第一条完整的生活记录会出现在这里。</p>
            </section>

            <section v-if="snapshot.bond.whisper" class="our-space__letter">
              <small>A LITTLE THOUGHT</small><p>“{{ snapshot.bond.whisper }}”</p><span>— {{ characterName }}</span>
            </section>
          </section>

          <section v-else-if="page === 'route'" class="our-space__route">
            <header class="our-space__page-heading"><small>DAY PATH</small><h3>今天，去了哪里？</h3><p>{{ snapshot.location.distance }} · {{ snapshot.location.transport }}</p></header>
            <div v-if="snapshot.location.route.length" class="our-space__route-list">
              <article v-for="(stop, index) in snapshot.location.route" :key="`${stop.time}-${index}`">
                <time>{{ stop.time }}<small v-if="stop.endTime">{{ stop.endTime }}</small></time>
                <span><i></i></span>
                <div><em>{{ activityLabel(stop.category) }}</em><strong>{{ stop.name }}</strong><p>{{ stop.detail }}</p><small>{{ stop.companion }}</small></div>
              </article>
            </div>
            <p v-else class="our-space__blank">这次记录没有可展示的行程节点。</p>
          </section>

          <section v-else class="our-space__phone">
            <header class="our-space__page-heading"><small>SOFT PHONE LIFE</small><h3>TA 的小小手机宇宙</h3><p>{{ screenStatusLabel }} · {{ snapshot.device.activeApp }}</p></header>
            <section class="our-space__phone-screen">
              <header><span><Smartphone :size="18" /></span><div><small>NOW USING</small><strong>{{ snapshot.device.activeApp }}</strong></div><b>{{ snapshot.device.battery }}%</b></header>
              <div class="our-space__phone-network"><Wifi :size="14" /><span>{{ snapshot.device.network }}</span><i>{{ snapshot.device.charging ? '正在充电' : screenStatusLabel }}</i></div>
            </section>
            <section v-if="snapshot.device.notes.length" class="our-space__paper-list">
              <header><small>RECENT NOTES</small><h4>随手记下的事</h4></header>
              <article v-for="(note, index) in snapshot.device.notes" :key="`${note.title}-${index}`"><small>{{ note.folder }} · {{ note.updatedAt }}</small><strong>{{ note.title }}</strong><p>{{ note.content }}</p></article>
            </section>
            <section v-if="snapshot.device.lifeRecords.length" class="our-space__paper-list our-space__paper-list--lavender">
              <header><small>DAY MARKS</small><h4>日程与生活记录</h4></header>
              <article v-for="(record, index) in snapshot.device.lifeRecords" :key="`${record.time}-${index}`"><small>{{ record.time }} · {{ record.status }}</small><strong>{{ record.title }}</strong><p>{{ record.detail }}</p></article>
            </section>
            <p v-if="!snapshot.device.notes.length && !snapshot.device.lifeRecords.length" class="our-space__blank">当前记录没有可展示的手机内容。</p>
          </section>
        </main>

        <nav class="our-space__nav" aria-label="情侣守护页面切换">
          <button type="button" :class="{ active: page === 'today' }" @click="page = 'today'"><Heart :size="19" fill="currentColor" /><span>今天</span></button>
          <button type="button" :class="{ active: page === 'route' }" @click="page = 'route'"><MapPinned :size="19" /><span>足迹</span></button>
          <button type="button" :class="{ active: page === 'phone' }" @click="page = 'phone'"><Smartphone :size="19" /><span>手机</span></button>
        </nav>
      </template>

      <section v-if="selectedEvent" class="our-space__detail-layer">
        <header><button type="button" aria-label="返回日记" @click="selectedEventId = ''"><ChevronLeft :size="20" /></button><small>DAILY NOTE</small><span></span></header>
        <CoupleGuardianEventDetail :event="guardianAttachmentFromEvent(selectedEvent, snapshot?.id ?? ledger.id, snapshot)" />
      </section>

      <section v-if="showSettings" class="our-space__settings-layer" @click.self="showSettings = false">
        <div>
          <span class="our-space__settings-handle" aria-hidden="true"></span>
          <header><div><small>OUR SPACE SETTINGS</small><h3>只属于我们的设置</h3></div><button type="button" aria-label="关闭设置" @click="showSettings = false"><X :size="18" /></button></header>
          <section class="our-space__settings-switch">
            <div><small>COUPLE GUARDIAN</small><strong>开启情侣守护</strong><p>关闭后停止所有守护生成与 API 调用，已有历史会保留。</p></div>
            <label><input :checked="guardianEnabled" type="checkbox" @change="setGuardianEnabled(($event.target as HTMLInputElement).checked)" /><span><i></i></span></label>
          </section>
          <dl class="our-space__settings-facts">
            <div><dt>账本记录</dt><dd>{{ ledger.events.length }} 条</dd></div>
            <div><dt>内容推进</dt><dd>{{ ledger.contentAdvanceCount }} 次</dd></div>
            <div><dt>授权动态</dt><dd>{{ visibleEventCount }} 条</dd></div>
          </dl>
          <p class="our-space__settings-note"><LockKeyhole :size="14" />关闭后不会更新地点、手机、联系人、行程或聊天动态，也不会请求内容模型；重新开启后仅从下一次手动更新或角色选择调用开始继续。</p>
          <button class="our-space__settings-clear" type="button" :disabled="clearingHistory" @click="clearGuardianHistory">{{ clearingHistory ? '正在清空…' : '清空情侣守护全部历史' }}</button>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, ChevronLeft, ChevronRight, Heart, LoaderCircle, LockKeyhole, MapPinned, Menu, RefreshCw, ShieldCheck, Smartphone, Sparkles, Wifi, X } from 'lucide-vue-next';
import CoupleGuardianEventDetail from '@/components/chat/CoupleGuardianEventDetail.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, CoupleActivityCategory, LifeLedgerEvent } from '@/types/domain';
import { createCoupleSpaceState } from '@/utils/coupleSpace';
import { formatGuardianEventTime, guardianAttachmentFromEvent, guardianEventIcon, isGuardianVisibleLifeEvent } from '@/utils/coupleGuardianEvents';
import { getCharacterAiName } from '@/utils/character';
import { lifeLedgerForCharacter, projectLifeLedgerSnapshot, recentLifeLedgerEvents } from '@/utils/lifeLedger';
import { getUserAiName } from '@/utils/profile';

const props = defineProps<{
  conversationId: string;
  character: CharacterProfile;
}>();

type SpacePage = 'today' | 'route' | 'phone';

const store = useAppStore();
const page = ref<SpacePage>('today');
const consentChecked = ref(false);
const syncing = ref(false);
const showSettings = ref(false);
const selectedEventId = ref('');
const clearingHistory = ref(false);

const characterName = computed(() => getCharacterAiName(props.character));
const userName = computed(() => getUserAiName(store.userById(props.character.boundUserId) ?? store.user));
const state = computed(() => props.character.coupleSpace);
const ledger = computed(() => lifeLedgerForCharacter(props.character));
const snapshot = computed(() => projectLifeLedgerSnapshot(ledger.value));
const recentLedgerEvents = computed(() => recentLifeLedgerEvents(ledger.value.events));
const ledgerEvents = computed(() => recentLedgerEvents.value
  .filter(isGuardianVisibleLifeEvent)
  .sort((left, right) => right.occurredAt - left.occurredAt));
const selectedEvent = computed<LifeLedgerEvent | undefined>(() => ledgerEvents.value.find((event) => event.id === selectedEventId.value));
const visibleEventCount = computed(() => recentLedgerEvents.value.filter(isGuardianVisibleLifeEvent).length);
const guardianEnabled = computed(() => state.value?.enabled !== false);
const guardianDisabled = computed(() => !guardianEnabled.value);
const topbarTitle = computed(() => page.value === 'route' ? '今天的足迹' : page.value === 'phone' ? '小小手机宇宙' : '我们的今天');
const screenStatusLabel = computed(() => snapshot.value?.device.screenStatus === 'using' ? '正在使用' : snapshot.value?.device.screenStatus === 'locked' ? '已锁屏' : '暂时放下');

async function enableGuardian() {
  if (!consentChecked.value) return;
  await store.saveCoupleSpaceState(props.character.id, createCoupleSpaceState());
}

async function syncLife() {
  if (syncing.value || !state.value?.consentGrantedAt || guardianDisabled.value) return;
  syncing.value = true;
  try {
    await store.refreshCoupleSpace(props.conversationId);
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '生活记录推进失败。', '无法推进记录');
  } finally {
    syncing.value = false;
  }
}

async function setGuardianEnabled(enabled: boolean) {
  const current = state.value;
  if (!current) return;
  await store.saveCoupleSpaceState(props.character.id, { ...current, enabled, activityFeedEnabled: enabled });
}

async function clearGuardianHistory() {
  if (clearingHistory.value || !window.confirm('确定清空情侣守护的全部历史吗？\n\n这会删除生活账本、快照、心愿和聊天中的守护卡片，无法恢复；共享授权与开关会保留。')) return;
  clearingHistory.value = true;
  try {
    await store.clearCoupleGuardianHistory(props.character.id);
    selectedEventId.value = '';
    page.value = 'today';
    showSettings.value = false;
    store.showConfigAlert('情侣守护的生活账本、快照、心愿和聊天守护卡片已清空；共享授权与开关仍保留。', '已清空情侣守护历史');
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '清空情侣守护历史失败。', '无法清空历史');
  } finally {
    clearingHistory.value = false;
  }
}

function openEvent(eventId: string) {
  selectedEventId.value = eventId;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(timestamp);
}

function activityLabel(category: CoupleActivityCategory) {
  return ({ sleep: '睡眠', home: '居家', travel: '移动', work: '工作 / 学习', meal: '吃饭', social: '社交', errand: '办事', leisure: '休闲' })[category];
}
</script>

<style>
.our-space { position: relative; min-height: 100%; overflow: hidden; color: #363237; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #fbfaf8; }
.our-space button { border: 0; cursor: pointer; font: inherit; }.our-space button:disabled { cursor: default; }
.our-space__welcome { position: relative; display: grid; min-height: 480px; align-content: start; overflow: hidden; padding: 22px 20px 18px; background: linear-gradient(154deg, #f4d6dd 0%, #f9eadf 48%, #e2e3f2 100%); }.our-space__welcome::before { content: ""; position: absolute; top: 84px; right: -54px; width: 214px; height: 214px; border: 1px solid rgba(255,255,255,.52); border-radius: 50%; box-shadow: 0 0 0 26px rgba(255,255,255,.12), 0 0 0 61px rgba(255,255,255,.1); }.our-space__welcome-light { position: absolute; right: 30px; bottom: 77px; width: 130px; height: 105px; border-radius: 60% 40% 55% 45%; opacity: .7; background: linear-gradient(135deg, #e8b8bd, #f5d6a7); filter: blur(18px); }.our-space__wordmark { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; color: #9b6a7a; font-size: 9px; font-weight: 900; letter-spacing: .17em; }.our-space__wordmark i { width: 4px; height: 4px; border-radius: 50%; background: #c78a99; }.our-space__welcome-copy { position: relative; z-index: 1; display: grid; gap: 8px; margin-top: 49px; }.our-space__welcome-copy small { color: #9e7780; font-size: 8px; font-weight: 850; letter-spacing: .16em; }.our-space__welcome-copy h3 { max-width: 285px; margin: 0; color: #514049; font-family: Georgia, "Songti SC", serif; font-size: 28px; font-weight: 600; line-height: 1.2; letter-spacing: -.06em; }.our-space__welcome-copy h3 em { display: block; color: #c47e91; font-style: normal; }.our-space__welcome-copy p { max-width: 265px; margin: 1px 0 0; color: #76616b; font-size: 11px; line-height: 1.75; }.our-space__pair { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; margin-top: 36px; }.our-space__pair img { width: 46px; height: 46px; border: 3px solid rgba(255,255,255,.76); border-radius: 17px 17px 17px 5px; object-fit: cover; box-shadow: 0 8px 16px rgba(122,83,100,.13); }.our-space__pair > span { display: grid; width: 26px; height: 26px; margin-left: -17px; place-items: center; border: 2px solid rgba(255,255,255,.88); border-radius: 50%; color: #d17c91; background: #fff6f5; }.our-space__pair div { display: flex; align-items: baseline; gap: 4px; margin-left: 2px; color: #6b5861; }.our-space__pair div small { font-size: 10px; font-weight: 700; }.our-space__pair div strong { color: #c2778b; font-family: Georgia, serif; font-size: 16px; font-weight: 400; }.our-space__consent { position: relative; z-index: 1; display: grid; grid-template-columns: 19px minmax(0, 1fr); align-items: center; gap: 8px; margin-top: auto; padding-top: 28px; color: #6e5963; font-size: 10px; cursor: pointer; }.our-space__consent input { position: absolute; opacity: 0; }.our-space__consent span { display: grid; width: 19px; height: 19px; place-items: center; border: 1px solid rgba(181,133,145,.45); border-radius: 7px 7px 3px 7px; color: transparent; background: rgba(255,255,255,.47); }.our-space__consent input:checked + span { color: #fff; background: #c77d91; }.our-space__consent b { font-weight: 650; }.our-space__join { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 43px; margin-top: 12px; border-radius: 15px 15px 6px 15px; color: #fff; font-size: 11px; font-weight: 850; background: #b9758a; box-shadow: 0 10px 18px rgba(151,89,112,.19); }.our-space__join:disabled { color: rgba(255,255,255,.65); background: #c5acb4; box-shadow: none; }.our-space__welcome-foot { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 4px; margin: 12px 0 0; color: #9a7d84; font-size: 8px; }
.our-space__topbar { display: grid; grid-template-columns: 36px minmax(0, 1fr) 36px; align-items: center; min-height: 61px; padding: 12px 16px 8px; background: rgba(251,250,248,.92); }.our-space__topbar > button { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: transparent; }.our-space__topbar-avatar { overflow: hidden; width: 31px; height: 31px; border: 1.5px solid #d7a3ad; border-radius: 50%; }.our-space__topbar-avatar img { width: 100%; height: 100%; object-fit: cover; }.our-space__topbar > div { display: grid; gap: 1px; min-width: 0; text-align: center; }.our-space__topbar small { color: #b28b96; font-size: 7px; font-weight: 850; letter-spacing: .14em; }.our-space__topbar strong { color: #51444b; font-family: Georgia, "Songti SC", serif; font-size: 14px; font-weight: 600; }.our-space__topbar-menu { justify-self: end; color: #8d7880; }
.our-space__first-page { display: grid; justify-items: center; min-height: 420px; align-content: center; padding: 28px; text-align: center; background: linear-gradient(180deg, #fbfaf8, #f7f2ef); }.our-space__first-page-art { position: relative; width: 112px; height: 112px; margin-bottom: 20px; }.our-space__first-page-art > span, .our-space__first-page-art > i { position: absolute; display: grid; place-items: center; border-radius: 50%; color: transparent; }.our-space__first-page-art > span { top: 7px; left: 9px; width: 75px; height: 75px; border: 1px solid #d7b6bd; }.our-space__first-page-art > i { right: 4px; bottom: 5px; width: 65px; height: 65px; border: 1px solid #c9c5df; font-style: normal; }.our-space__first-page-art > b { position: absolute; top: 45px; left: 46px; color: #c58093; font-size: 19px; }.our-space__first-page small { color: #ab8a93; font-size: 7px; font-weight: 850; letter-spacing: .14em; }.our-space__first-page h3 { margin: 8px 0; color: #52434b; font-family: Georgia, "Songti SC", serif; font-size: 22px; font-weight: 600; line-height: 1.32; letter-spacing: -.05em; }.our-space__first-page h3 em { display: block; color: #c38293; font-style: normal; }.our-space__first-page p { max-width: 280px; margin: 0; color: #827078; font-size: 10px; line-height: 1.7; }.our-space__first-page button { display: inline-flex; align-items: center; gap: 6px; min-height: 39px; margin-top: 17px; padding: 0 14px; border-radius: 14px 14px 5px 14px; color: #fff; font-size: 10px; font-weight: 850; background: #ba778c; }.our-space__first-page button:disabled { opacity: .62; }
.our-space__content { min-height: 390px; padding: 8px 16px 77px; }.our-space__hero { position: relative; overflow: hidden; display: grid; min-height: 203px; padding: 17px; border-radius: 23px 23px 7px 23px; color: #fff; background: linear-gradient(148deg, #b4b1d6, #e8bfc0 48%, #f1d1a5); box-shadow: 0 14px 25px rgba(111,83,102,.13); }.our-space__hero::after { content: ""; position: absolute; right: -29px; bottom: -51px; width: 160px; height: 160px; border: 19px solid rgba(113,102,143,.18); border-radius: 50%; }.our-space__hero-sky i, .our-space__hero-sky b, .our-space__hero-sky em { position: absolute; display: block; border-radius: 50%; }.our-space__hero-sky i { top: 28px; right: 32px; width: 39px; height: 39px; background: rgba(255,246,217,.63); box-shadow: 0 0 0 14px rgba(255,240,203,.12); }.our-space__hero-sky b { top: 69px; left: -19px; width: 112px; height: 30px; opacity: .32; background: #fff; filter: blur(8px); }.our-space__hero-sky em { top: 33px; left: 33px; width: 5px; height: 5px; background: rgba(255,255,255,.68); }.our-space__hero-label { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; color: rgba(255,255,255,.85); font-size: 8px; font-weight: 800; letter-spacing: .08em; }.our-space__hero-label span { padding: 4px 7px; border-radius: 8px 8px 3px 8px; background: rgba(80,70,98,.22); }.our-space__hero-label time { font-size: 8px; }.our-space__hero-copy { position: relative; z-index: 1; display: grid; align-self: end; gap: 3px; }.our-space__hero-copy small { font-size: 8px; font-weight: 800; letter-spacing: .12em; }.our-space__hero-copy h3 { margin: 0; font-family: Georgia, "Songti SC", serif; font-size: 27px; font-weight: 600; letter-spacing: -.05em; }.our-space__hero-copy p { margin: 0; font-size: 11px; line-height: 1.5; }.our-space__hero > button { position: absolute; z-index: 2; right: 12px; bottom: 12px; display: inline-flex; align-items: center; gap: 4px; min-height: 27px; padding: 0 8px; border: 1px solid rgba(255,255,255,.42); border-radius: 9px 9px 4px 9px; color: #fff; font-size: 8px; font-weight: 800; background: rgba(69,60,80,.2); }.our-space__hero > button:disabled { opacity: .6; }
.our-space__moodline { display: flex; align-items: center; gap: 8px; padding: 15px 4px 13px; border-bottom: 1px solid #e5ddda; }.our-space__moodline > span { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 11px 11px 5px 11px; background: #f4e9e3; }.our-space__moodline p { display: grid; min-width: 0; gap: 1px; margin: 0; }.our-space__moodline p small { color: #ad98a0; font-size: 8px; }.our-space__moodline p strong { color: #5a4952; font-size: 11px; }.our-space__moodline > em { margin-left: auto; color: #9c828a; font-size: 9px; font-style: normal; }.our-space__diary { display: grid; gap: 8px; margin-top: 15px; }.our-space__diary > header, .our-space__paper-list > header { display: flex; align-items: end; justify-content: space-between; }.our-space__diary > header div, .our-space__paper-list > header { display: grid; gap: 2px; }.our-space__diary header small, .our-space__paper-list header small, .our-space__page-heading small { color: #b28a96; font-size: 7px; font-weight: 850; letter-spacing: .15em; }.our-space__diary h4, .our-space__paper-list h4 { margin: 0; color: #584851; font-family: Georgia, "Songti SC", serif; font-size: 17px; font-weight: 600; letter-spacing: -.04em; }.our-space__diary > header > span { padding: 3px 6px; border-radius: 7px 7px 3px 7px; color: #a8838e; font-size: 8px; background: #f4eaec; }.our-space__diary-list { display: grid; }.our-space__diary-list button { display: grid; grid-template-columns: 42px 25px minmax(0, 1fr) 15px; align-items: center; gap: 7px; padding: 12px 1px; color: inherit; text-align: left; }.our-space__diary-list button + button { border-top: 1px solid #ebe4e2; }.our-space__diary-list time { color: #a29097; font-size: 8px; line-height: 1.4; }.our-space__diary-list button > span { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 9px 9px 4px 9px; color: #bc798d; font-size: 12px; background: #f8eded; }.our-space__diary-list button:nth-child(3n + 2) > span { color: #8587ae; background: #eeeff9; }.our-space__diary-list button:nth-child(3n) > span { color: #b18b5e; background: #faf0df; }.our-space__diary-list button > div { display: grid; gap: 2px; min-width: 0; }.our-space__diary-list strong { color: #5d4d56; font-size: 11px; line-height: 1.4; }.our-space__diary-list p { margin: 0; color: #86757d; font-size: 9px; line-height: 1.5; word-break: break-word; }.our-space__diary-list button > svg { color: #aa98a0; }.our-space__letter { display: grid; gap: 6px; margin-top: 12px; padding: 15px 16px 13px; border-radius: 0 16px 16px 16px; color: #725e67; background: #f6f0e8; }.our-space__letter small { color: #b18c7f; font-size: 7px; font-weight: 850; letter-spacing: .15em; }.our-space__letter p { margin: 0; font-family: Georgia, "Songti SC", serif; font-size: 15px; line-height: 1.5; }.our-space__letter span { color: #ae9093; font-size: 9px; text-align: right; }.our-space__blank { margin: 12px 0; padding: 17px; border: 1px dashed #e0d5d5; border-radius: 15px; color: #9c8990; font-size: 10px; line-height: 1.6; text-align: center; }
.our-space__page-heading { display: grid; gap: 4px; padding: 9px 1px 15px; }.our-space__page-heading h3 { margin: 0; color: #55454e; font-family: Georgia, "Songti SC", serif; font-size: 24px; font-weight: 600; letter-spacing: -.05em; }.our-space__page-heading p { margin: 0; color: #9b838b; font-size: 9px; }.our-space__route-list { display: grid; }.our-space__route-list article { display: grid; grid-template-columns: 43px 18px minmax(0, 1fr); gap: 9px; min-height: 80px; }.our-space__route-list time { padding-top: 3px; color: #a08d94; font-size: 9px; text-align: right; }.our-space__route-list time small { display: block; color: #c0b2b6; font-size: 7px; }.our-space__route-list article > span { position: relative; display: grid; justify-content: center; }.our-space__route-list article > span::after { content: ""; position: absolute; top: 17px; bottom: -4px; width: 1px; background: #e5dddd; }.our-space__route-list article:last-child > span::after { display: none; }.our-space__route-list article > span i { position: relative; z-index: 1; width: 11px; height: 11px; margin-top: 3px; border: 3px solid #fbfaf8; border-radius: 50%; background: #cd8495; box-shadow: 0 0 0 1px #e6cad1; }.our-space__route-list article:nth-child(2n) > span i { background: #8f91b9; box-shadow: 0 0 0 1px #d5d7e9; }.our-space__route-list article > div { display: grid; align-content: start; gap: 2px; padding-bottom: 15px; }.our-space__route-list em { color: #b18a96; font-size: 8px; font-style: normal; }.our-space__route-list strong { color: #594952; font-size: 12px; }.our-space__route-list p { margin: 1px 0; color: #817078; font-size: 9px; line-height: 1.55; white-space: pre-wrap; }.our-space__route-list div > small { color: #ad9ba1; font-size: 8px; }
.our-space__phone-screen { display: grid; gap: 12px; padding: 15px; border-radius: 21px 21px 7px 21px; color: #fff; background: linear-gradient(145deg, #9895b9, #d6a4af); box-shadow: 0 11px 21px rgba(120,96,119,.13); }.our-space__phone-screen header { display: grid; grid-template-columns: 31px minmax(0, 1fr) auto; align-items: center; gap: 8px; }.our-space__phone-screen header > span { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 10px 10px 4px 10px; background: rgba(255,255,255,.22); }.our-space__phone-screen header div { display: grid; gap: 2px; min-width: 0; }.our-space__phone-screen header small { color: rgba(255,255,255,.76); font-size: 7px; font-weight: 850; letter-spacing: .14em; }.our-space__phone-screen header strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.our-space__phone-screen header b { font-size: 17px; }.our-space__phone-network { display: flex; align-items: center; gap: 5px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.24); font-size: 9px; }.our-space__phone-network span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.our-space__phone-network i { margin-left: auto; font-style: normal; white-space: nowrap; }.our-space__paper-list { display: grid; gap: 8px; margin-top: 15px; padding: 14px; border-radius: 16px 16px 7px 16px; background: #fffdf9; box-shadow: inset 0 0 0 1px rgba(230,218,211,.75); }.our-space__paper-list--lavender { background: #fbfaff; box-shadow: inset 0 0 0 1px rgba(223,220,236,.8); }.our-space__paper-list article { display: grid; gap: 2px; padding-top: 9px; border-top: 1px dashed #e9dfdc; }.our-space__paper-list article > small { color: #ab999f; font-size: 8px; }.our-space__paper-list article > strong { color: #5d4e56; font-size: 11px; }.our-space__paper-list article > p { margin: 0; color: #7d6e76; font-size: 9px; line-height: 1.6; white-space: pre-wrap; }
.our-space__nav { position: absolute; right: 16px; bottom: 11px; left: 16px; z-index: 3; display: grid; grid-template-columns: repeat(3, 1fr); min-height: 54px; padding: 5px; border: 1px solid rgba(255,255,255,.8); border-radius: 19px 19px 8px 19px; background: rgba(255,255,255,.88); box-shadow: 0 11px 29px rgba(88,69,79,.16); backdrop-filter: blur(14px); }.our-space__nav button { display: grid; justify-items: center; align-content: center; gap: 2px; border-radius: 13px; color: #a18e95; font-size: 8px; }.our-space__nav button.active { color: #be7188; background: #fbf0f2; }.our-space__nav svg { stroke-width: 1.8; }
.our-space__detail-layer { position: absolute; z-index: 6; inset: 0; overflow: auto; padding: 13px 14px 24px; background: linear-gradient(180deg, #fffdfc, #f7f5f6); }.our-space__detail-layer > header { display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; align-items: center; margin-bottom: 12px; }.our-space__detail-layer > header button { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 50%; color: #866d77; background: #f5ebec; }.our-space__detail-layer > header small { color: #ad8b96; font-size: 8px; font-weight: 850; letter-spacing: .15em; text-align: center; }
.our-space__settings-layer { position: absolute; z-index: 7; inset: 0; display: flex; align-items: end; background: rgba(58,47,53,.2); }.our-space__settings-layer > div { width: 100%; padding: 8px 18px 24px; border-radius: 27px 27px 0 0; background: #fffdfb; box-shadow: 0 -15px 36px rgba(60,45,52,.13); }.our-space__settings-handle { display: block; width: 30px; height: 3px; margin: 0 auto 16px; border-radius: 9px; background: #dfd3d2; }.our-space__settings-layer header { display: flex; align-items: center; justify-content: space-between; }.our-space__settings-layer header div { display: grid; gap: 3px; }.our-space__settings-layer header small { color: #b28a96; font-size: 7px; font-weight: 850; letter-spacing: .14em; }.our-space__settings-layer header h3 { margin: 0; color: #54444d; font-family: Georgia, "Songti SC", serif; font-size: 19px; font-weight: 600; }.our-space__settings-layer header button { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 50%; color: #856e77; background: #f6efee; }.our-space__settings-switch { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 13px 0; border-top: 1px solid #eee5e2; border-bottom: 1px solid #eee5e2; }.our-space__settings-switch > div { display: grid; gap: 2px; }.our-space__settings-switch small { color: #b38e99; font-size: 7px; font-weight: 850; letter-spacing: .12em; }.our-space__settings-switch strong { color: #5b4b53; font-size: 11px; }.our-space__settings-switch p { margin: 0; color: #927f86; font-size: 9px; }.our-space__settings-switch label { margin-left: auto; cursor: pointer; }.our-space__settings-switch input { position: absolute; opacity: 0; }.our-space__settings-switch label > span { display: flex; width: 39px; height: 22px; padding: 3px; border-radius: 99px; background: #dcd4d5; transition: background .2s ease; }.our-space__settings-switch label i { width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(56,39,47,.17); transition: transform .2s ease; }.our-space__settings-switch input:checked + span { background: #c47b90; }.our-space__settings-switch input:checked + span i { transform: translateX(17px); }.our-space__settings-facts { display: grid; grid-template-columns: repeat(3, 1fr); margin: 14px 0; }.our-space__settings-facts div { display: grid; gap: 2px; }.our-space__settings-facts div + div { padding-left: 10px; border-left: 1px solid #eee5e4; }.our-space__settings-facts dt { color: #a08b92; font-size: 8px; }.our-space__settings-facts dd { margin: 0; color: #594950; font-size: 14px; font-weight: 800; }.our-space__settings-note { display: flex; align-items: start; gap: 6px; margin: 0; padding: 10px; border-radius: 10px 10px 4px 10px; color: #8b787f; font-size: 9px; line-height: 1.6; background: #f8f1eb; }.our-space__settings-note svg { flex: none; margin-top: 1px; color: #bd8d79; }
.our-space__settings-clear { width: 100%; min-height: 37px; margin-top: 12px; border: 1px solid #efcaca !important; border-radius: 11px 11px 4px 11px !important; color: #ba6571 !important; font-size: 10px !important; font-weight: 800 !important; background: #fff6f5 !important; }.our-space__settings-clear:disabled { opacity: .6; }
.our-space__spin { animation: our-space-spin .85s linear infinite; }@keyframes our-space-spin { to { transform: rotate(360deg); } }
</style>