<template>
  <main class="native-access-page">
    <section class="native-access-card">
      <header>
        <span>BabyLink</span>
        <h1>验证你的 QQ</h1>
        <p>此应用已改为本地启动，只会向 BabyLink 服务请求访问验证和业务 API。</p>
      </header>

      <form v-if="!challenge" @submit.prevent="createChallenge">
        <label>
          <span>QQ 号码</span>
          <input v-model="qq" inputmode="numeric" autocomplete="username" maxlength="12" pattern="[1-9][0-9]{4,11}" placeholder="请输入你的 QQ 号" :disabled="busy" required />
        </label>
        <button type="submit" :disabled="busy || !validQq">{{ busy ? '正在创建验证…' : '获取群验证口令' }}</button>
      </form>

      <section v-else class="challenge">
        <p>请使用 QQ 在任意授权群发送：</p>
        <strong>{{ challenge.command }}</strong>
        <small>口令 {{ challenge.code }}，验证完成后将自动进入应用。</small>
        <button type="button" :disabled="busy" @click="copyCommand">复制验证命令</button>
        <button class="secondary" type="button" :disabled="busy" @click="resetChallenge">更换 QQ</button>
      </section>

      <p v-if="message" :class="['message', messageKind]">{{ message }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { clearNativeAccessChallenge, createNativeAccessChallenge, pollNativeAccessChallenge, readNativeAccessChallenge, saveNativeAccessChallenge, type NativeAccessChallenge } from '@/services/access';

const qq = ref('');
const challenge = ref<NativeAccessChallenge | null>(null);
const busy = ref(false);
const message = ref('');
const messageKind = ref<'error' | 'success'>('success');
let pollTimer: number | undefined;
let stopCapacitorResumeListener: (() => void) | undefined;
let pageMounted = false;

const validQq = computed(() => /^[1-9]\d{4,11}$/.test(qq.value.trim()));

function setMessage(nextMessage: string, kind: 'error' | 'success' = 'success') {
  message.value = nextMessage;
  messageKind.value = kind;
}

function schedulePoll() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void pollChallenge(), 1_800);
}

function pollOnResume() {
  if (document.visibilityState !== 'visible' || !challenge.value || busy.value) return;
  if (pollTimer !== undefined) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void pollChallenge(), 0);
}

async function createChallenge() {
  if (!validQq.value || busy.value) return;
  busy.value = true;
  try {
    challenge.value = await createNativeAccessChallenge(qq.value);
    saveNativeAccessChallenge(challenge.value);
    setMessage('口令已创建，正在等待授权群验证。');
    schedulePoll();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '无法创建验证口令。', 'error');
  } finally {
    busy.value = false;
  }
}

async function pollChallenge() {
  const currentChallenge = challenge.value;
  if (!currentChallenge || busy.value) return;
  busy.value = true;
  try {
    const state = await pollNativeAccessChallenge(currentChallenge);
    if (state === 'pending') {
      setMessage('正在等待 NapCat 收到群消息。');
      schedulePoll();
      return;
    }
    clearNativeAccessChallenge();
    setMessage('验证成功，正在进入 BabyLink。');
    window.setTimeout(() => window.location.replace('/home'), 300);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '验证失败。', 'error');
    if (/不存在|过期|已经使用|状态异常/.test(error instanceof Error ? error.message : '')) {
      clearNativeAccessChallenge();
      challenge.value = null;
    } else {
      schedulePoll();
    }
  } finally {
    busy.value = false;
  }
}

async function copyCommand() {
  const command = challenge.value?.command ?? '';
  if (!command) return;
  await navigator.clipboard?.writeText(command).catch(() => undefined);
  setMessage('验证命令已复制。');
}

function resetChallenge() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer);
  pollTimer = undefined;
  clearNativeAccessChallenge();
  challenge.value = null;
  setMessage('');
}

onMounted(() => {
  pageMounted = true;
  challenge.value = readNativeAccessChallenge();
  if (challenge.value) {
    setMessage('已恢复验证口令，正在等待授权群验证。');
    schedulePoll();
  }
  document.addEventListener('visibilitychange', pollOnResume);
  void CapacitorApp.addListener('resume', pollOnResume).then((listener) => {
    if (!pageMounted) {
      void listener.remove();
      return;
    }
    stopCapacitorResumeListener = () => void listener.remove();
  });
});

onBeforeUnmount(() => {
  pageMounted = false;
  if (pollTimer !== undefined) window.clearTimeout(pollTimer);
  document.removeEventListener('visibilitychange', pollOnResume);
  stopCapacitorResumeListener?.();
  stopCapacitorResumeListener = undefined;
});
</script>

<style scoped>
.native-access-page { display: grid; min-height: var(--app-height); padding: calc(28px + var(--safe-top)) 20px calc(28px + var(--safe-bottom)); background: linear-gradient(155deg, #f1fbf5, #f5f7ff); }
.native-access-card { width: min(100%, 430px); margin: auto; padding: 25px; border: 1px solid rgba(25,70,43,.08); border-radius: 28px; background: #fff; box-shadow: 0 18px 42px rgba(37,73,50,.12); }
header { display: grid; gap: 8px; margin-bottom: 22px; } header > span { color: #079d4d; font-size: 12px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; } h1 { margin: 0; font-size: 27px; } p { margin: 0; color: #657169; line-height: 1.6; }
form, .challenge { display: grid; gap: 14px; } label { display: grid; gap: 7px; color: #26352c; font-size: 13px; font-weight: 750; } input { min-height: 52px; padding: 0 15px; border: 1px solid #dce8e0; border-radius: 15px; background: #f9fcfa; font-size: 17px; }
button { min-height: 50px; border-radius: 15px; background: linear-gradient(135deg, #19c768, #079d4d); color: #fff; font-weight: 800; } button:disabled { opacity: .6; } button.secondary { background: #e9f4ed; color: #17633a; } .challenge strong { display: block; padding: 13px; border-radius: 14px; background: #17231c; color: #ecfff3; overflow-wrap: anywhere; font-size: 14px; } .challenge small { color: #657169; line-height: 1.5; }
.message { margin-top: 18px; font-size: 13px; text-align: center; } .message.error { color: #c63e3e; } .message.success { color: #078843; }
</style>