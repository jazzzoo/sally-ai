// frontend/src/store/useStore.js
// Sally.ai 전역 상태 (Zustand + AsyncStorage persist)
//
// 슬라이스 구성:
//   auth       — guestId 초기화
//   project    — 현재 프로젝트
//   session    — 현재 세션 + 입력 폼
//   generation — SSE 스트리밍 진행 상태
//   questions  — 생성된 질문 리스트 (캐시)


import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initGuestId } from './guestStorage';

const useStore = create(
  persist(
    (set, get) => ({

      // ── auth ─────────────────────────────────────────────
      guestId: null,
      initAuth: async () => {
        const id = await initGuestId();
        set({ guestId: id });
      },

      // ── nav title (NavBar 중앙 동적 텍스트) ──────────────
      navTitle: '',
      setNavTitle: (t) => set({ navTitle: t }),

      // ── project ──────────────────────────────────────────
      currentProject: null,
      projectList: [],
      setCurrentProject: (p) => set({ currentProject: p }),
      setProjectList: (l) => set({ projectList: l }),

      // ── session ───────────────────────────────────────────
      currentSession: null,
      sessionForm: {
        businessSummary: '',
        persona: '',
        style: '중립',
      },
      setCurrentSession: (s) => set({ currentSession: s }),
      updateSessionForm: (partial) =>
        set((state) => ({ sessionForm: { ...state.sessionForm, ...partial } })),
      resetSessionForm: () =>
        set({ sessionForm: { businessSummary: '', persona: '', style: '중립' } }),

      // ── generation (SSE 스트리밍) ──────────────────────────
      isGenerating: false,
      streamingChunk: '',
      generatedItems: [],
      closeStream: null,

      setIsGenerating: (v) => set({ isGenerating: v }),
      setStreamingChunk: (t) => set({ streamingChunk: t }),
      appendStreamingChunk: (text) =>
        set((state) => ({ streamingChunk: state.streamingChunk + text })),
      resetGeneration: () => set({
        isGenerating: false, streamingChunk: '', generatedItems: [], closeStream: null,
      }),
      appendGeneratedItem: (item) =>
        set((state) => ({ generatedItems: [...state.generatedItems, item] })),
      setCloseStream: (fn) => set({ closeStream: fn }),
      cancelStream: () => {
        get().closeStream?.();
        set({ isGenerating: false, closeStream: null });
      },

      // ── questions cache ────────────────────────────────────
      questionListCache: {},
      currentListId: null,

      setQuestionList: (listId, list) =>
        set((state) => ({
          questionListCache: { ...state.questionListCache, [listId]: list },
        })),
      updateQuestion: (listId, qNumOrText, patch) =>
        set((state) => {
          const list = state.questionListCache[listId];
          if (!list) return {};
          return {
            questionListCache: {
              ...state.questionListCache,
              [listId]: {
                ...list,
                questions: list.questions.map((q) =>
                  q.number === qNumOrText ? { ...q, ...patch, number: q.number } : q
                ),
              },
            },
          };
        }),
      // 현재 deleteQuestion 제거하고 아래로 교체
      toggleHidden: (listId, index, nextHidden) =>
        set((state) => {
          const list = state.questionListCache[listId];
          if (!list) return state;
          let counter = 1;
          const questions = list.questions
            .map((q) => {
              const isMatch = index < 0 ? q.number === index : q.index === index;
              return isMatch ? { ...q, hidden: nextHidden } : q;
            })
            .map((q) => {
              if (q.type === 'icebreaker' || q.hidden) return q;
              return { ...q, number: counter++ };
            });
          return {
            questionListCache: {
              ...state.questionListCache,
              [listId]: { ...list, questions },
            },
          };
        }),
      setCurrentListId: (id) => set({ currentListId: id }),
    }),

    {
      name: 'sally-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionForm: state.sessionForm,
        questionListCache: state.questionListCache,
        currentListId: state.currentListId,
        currentProject: state.currentProject,
      }),
    }
  )
);

export default useStore;