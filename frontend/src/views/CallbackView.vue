<template><p class="text-center mt-24">{{ msg }}</p></template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { handleCallback } from '../services/auth';

const msg = ref('Signing you in…');
const router = useRouter();

onMounted(async () => {
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) throw new Error('No code in callback');
    await handleCallback(code);
    router.push('/tickets');
  } catch (e) {
    msg.value = `Sign-in failed: ${e.message}`;
  }
});
</script>
