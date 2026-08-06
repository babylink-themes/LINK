<template>
  <section class="guardian-event-detail">
    <header>
      <span :class="`kind-${event.kind ?? 'activity'}`">{{ guardianEventIcon(event.kind, event.icon) }}</span>
      <div>
        <small>{{ guardianEventKindLabel(event.kind) }}</small>
        <time>{{ formatGuardianEventTime(event.occurredAt ?? Date.now()) }}</time>
      </div>
    </header>

    <h3>{{ event.title }}</h3>
    <p class="guardian-event-detail__summary">{{ event.summary }}</p>

    <section v-if="showEventRecord && event.detail" class="guardian-event-detail__record">
      <small>完整事件经过</small>
      <p>{{ event.detail }}</p>
    </section>

    <template v-for="(block, index) in detailBlocks" :key="`${block.type}-${index}`">
      <section v-if="block.type === 'text'" class="guardian-event-detail__record">
        <small>{{ block.label }}</small>
        <p>{{ block.content }}</p>
      </section>

      <section v-else-if="block.type === 'note'" class="guardian-event-detail__note">
        <header>
          <div><small>{{ block.folder }}{{ block.pinned ? ' · 已置顶' : '' }}</small><strong>{{ block.title }}</strong></div>
          <time>{{ block.updatedAt }}</time>
        </header>
        <p>{{ block.content }}</p>
      </section>

      <section v-else-if="block.type === 'conversation'" class="guardian-event-detail__conversation">
        <header>
          <div><small>{{ block.relation }}</small><strong>{{ block.contact }}</strong></div>
          <span>完整聊天记录</span>
        </header>
        <p v-if="block.summary" class="guardian-event-detail__conversation-summary">{{ block.summary }}</p>
        <div class="guardian-event-detail__messages">
          <p v-for="(message, messageIndex) in block.messages" :key="`${message.time}-${messageIndex}`" :class="message.sender">
            <small>{{ message.sender === 'character' ? '对方' : block.contact }} · {{ message.time }}</small>
            <span>{{ message.text }}</span>
          </p>
        </div>
      </section>

      <section v-else class="guardian-event-detail__fields">
        <small>{{ block.title }}</small>
        <dl>
          <div v-for="field in block.fields" :key="`${field.label}-${field.value}`"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div>
        </dl>
      </section>
    </template>

    <div v-if="event.app || event.place || event.battery !== undefined" class="guardian-event-detail__meta">
      <article v-if="event.app"><small>相关应用</small><strong>{{ event.app }}</strong></article>
      <article v-if="event.place"><small>发生地点</small><strong>{{ event.place }}</strong></article>
      <article v-if="event.battery !== undefined"><small>当时电量</small><strong>{{ event.battery }}%{{ event.charging ? ' · 充电中' : '' }}</strong></article>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatCoupleActivityAttachment } from '@/types/domain';
import { formatGuardianEventTime, guardianEventIcon, guardianEventKindLabel } from '@/utils/coupleGuardianEvents';

const props = defineProps<{
  event: ChatCoupleActivityAttachment;
}>();

const detailBlocks = computed(() => props.event.detailBlocks ?? []);
const showEventRecord = computed(() => !detailBlocks.value.some((block) => block.type === 'text'));
</script>

<style scoped>
.guardian-event-detail { display: grid; gap: 14px; color: #272421; }
.guardian-event-detail > header { display: flex; align-items: center; gap: 11px; }
.guardian-event-detail > header > span { display: grid; width: 42px; height: 42px; flex: none; place-items: center; border-radius: 13px; color: #fff; font-size: 20px; background: linear-gradient(145deg, #f3b24e, #ef7d55); box-shadow: 0 8px 20px rgba(213, 125, 65, .2); }
.guardian-event-detail > header > span.kind-screen { background: linear-gradient(145deg, #7585e9, #a06fd0); }
.guardian-event-detail > header > span.kind-app { background: linear-gradient(145deg, #6e9fef, #5c7bd9); }
.guardian-event-detail > header > span.kind-network { background: linear-gradient(145deg, #4bb6a1, #4a8bc4); }
.guardian-event-detail > header > span.kind-location, .guardian-event-detail > header > span.kind-travel { background: linear-gradient(145deg, #ee826c, #df5e72); }
.guardian-event-detail > header > span.kind-notification { background: linear-gradient(145deg, #f0a04d, #e87359); }
.guardian-event-detail > header > span.kind-activity { background: linear-gradient(145deg, #dd7ca5, #9878d4); }
.guardian-event-detail > header div { display: grid; gap: 2px; }
.guardian-event-detail > header small, .guardian-event-detail__record > small, .guardian-event-detail__meta small { color: #9a8b81; font-size: 9px; font-weight: 850; letter-spacing: .08em; }
.guardian-event-detail > header time { color: #5d5650; font-size: 11px; font-weight: 760; }
.guardian-event-detail h3 { margin: 0; font-size: 18px; line-height: 1.35; }
.guardian-event-detail__summary { margin: -7px 0 0; color: #6f665f; font-size: 12px; line-height: 1.7; }
.guardian-event-detail__record { display: grid; gap: 7px; padding: 14px; border: 1px solid rgba(118, 99, 85, .1); border-radius: 16px; background: rgba(255, 255, 255, .75); }
.guardian-event-detail__record p { margin: 0; color: #403b37; font-size: 12px; line-height: 1.8; white-space: pre-wrap; }
.guardian-event-detail__note, .guardian-event-detail__conversation, .guardian-event-detail__fields { display: grid; gap: 10px; padding: 14px; border: 1px solid rgba(118, 99, 85, .1); border-radius: 16px; background: rgba(255, 255, 255, .78); }
.guardian-event-detail__note > header, .guardian-event-detail__conversation > header { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
.guardian-event-detail__note header div, .guardian-event-detail__conversation header div { display: grid; gap: 3px; min-width: 0; }
.guardian-event-detail__note header small, .guardian-event-detail__conversation header small, .guardian-event-detail__fields > small { color: #9a8b81; font-size: 9px; font-weight: 850; letter-spacing: .08em; }
.guardian-event-detail__note header strong, .guardian-event-detail__conversation header strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.guardian-event-detail__note header time { flex: none; color: #9b8d84; font-size: 9px; }
.guardian-event-detail__note > p { margin: 0; padding: 11px 12px; border-radius: 11px; color: #49423d; font-size: 12px; line-height: 1.8; white-space: pre-wrap; background: #fffdf7; }
.guardian-event-detail__conversation header > span { flex: none; padding: 3px 5px; border-radius: 5px; color: #a97045; font-size: 8px; background: #fff0df; }
.guardian-event-detail__conversation-summary { margin: -3px 0 0; color: #756861; font-size: 10px; line-height: 1.55; }
.guardian-event-detail__messages { display: grid; gap: 7px; }
.guardian-event-detail__messages p { display: grid; justify-self: start; gap: 3px; max-width: 90%; margin: 0; padding: 8px 10px; border-radius: 5px 12px 12px; color: #514942; font-size: 11px; line-height: 1.55; background: #f5f1ed; }
.guardian-event-detail__messages p.character { justify-self: end; border-radius: 12px 5px 12px 12px; background: #fff0e7; }
.guardian-event-detail__messages small { color: #9b8d84; font-size: 8px; }.guardian-event-detail__messages span { white-space: pre-wrap; }
.guardian-event-detail__fields dl { display: grid; gap: 7px; margin: 0; }.guardian-event-detail__fields dl div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; }.guardian-event-detail__fields dt { color: #a09087; font-size: 10px; }.guardian-event-detail__fields dd { margin: 0; color: #504740; font-size: 10px; line-height: 1.55; white-space: pre-wrap; }
.guardian-event-detail__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; }
.guardian-event-detail__meta article { display: grid; gap: 4px; min-width: 0; padding: 10px; border-radius: 13px; background: rgba(245, 241, 238, .8); }
.guardian-event-detail__meta strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
</style>