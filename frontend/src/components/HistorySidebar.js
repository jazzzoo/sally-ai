// frontend/src/components/HistorySidebar.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  ScrollView, StyleSheet, TextInput,
} from 'react-native';
import { sessionsApi, questionListsApi } from '../api/client';
import useStore from '../store/useStore';
import { colors, spacing, radius, textStyles } from '../theme';
import { Star, Trash2, Pencil } from 'lucide-react-native';
import ModalDialog from './ModalDialog';

export default function HistorySidebar({ onSelect }) {
  const { currentListId, setCurrentListId, setQuestionList } = useStore();
  const [history, setHistory] = useState([]);
  const [editModal, setEditModal] = useState({ visible: false, item: null, text: '' });
  const [deleteModal, setDeleteModal] = useState({ visible: false, item: null });

  const loadHistory = useCallback(async () => {
    try {
      const res = await sessionsApi.history();
      setHistory(res.history || []);
    } catch (err) {
      console.error('[HistorySidebar] load error:', err.message);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [currentListId]);

  async function handleSelect(item) {
    try {
      const res = await questionListsApi.get(item.id);
      setQuestionList(item.id, res.question_list);
      setCurrentListId(item.id);
      onSelect?.(item.id);
    } catch (err) {
      window.alert('불러오기 실패: ' + err.message);
    }
  }

  async function handleFavorite(e, item) {
    e.stopPropagation?.();
    try {
      await questionListsApi.favorite(item.id);
      setHistory((prev) =>
        prev.map((h) => h.id === item.id ? { ...h, is_favorite: !h.is_favorite } : h)
          .sort((a, b) => b.is_favorite - a.is_favorite || new Date(b.created_at) - new Date(a.created_at))
      );
    } catch (err) {
      window.alert('즐겨찾기 실패: ' + err.message);
    }
  }

  function handleDeleteStart(e, item) {
    e.stopPropagation?.();
    setDeleteModal({ visible: true, item });
  }

  async function handleDeleteConfirm() {
    const { item } = deleteModal;
    try {
      await questionListsApi.delete(item.id);
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
      setDeleteModal({ visible: false, item: null });
    } catch (err) {
      window.alert('삭제 실패: ' + err.message);
    }
  }

  function handleEditStart(e, item) {
    e.stopPropagation?.();
    setEditModal({
      visible: true,
      item,
      text: item.title || item.input_context?.business_summary?.slice(0, 20) || '',
    });
  }

  async function handleEditSave() {
    const { item, text } = editModal;
    try {
      await questionListsApi.updateTitle(item.id, text.trim());
      setHistory((prev) =>
        prev.map((h) => h.id === item.id ? { ...h, title: text.trim() } : h)
      );
      setEditModal({ visible: false, item: null, text: '' });
    } catch (err) {
      window.alert('수정 실패: ' + err.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>히스토리</Text>
      <ScrollView contentContainerStyle={styles.scroll}>
        {history.length === 0 && (
          <Text style={styles.empty}>생성된 질문이 없습니다</Text>
        )}
        {history.map((item) => {
          const isActive = item.id === currentListId;
          const displayTitle = item.title ||
            item.input_context?.business_summary?.slice(0, 20) ||
            '제목 없음';

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, isActive && styles.itemActive]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.8}
            >
              {/* 즐겨찾기 아이콘 */}
              <TouchableOpacity
                onPress={(e) => handleFavorite(e, item)}
                style={styles.starBtn}
              >
                <Star
                  size={14}
                  color={item.is_favorite ? colors.primaryEnd : colors.textDisabled}
                  fill={item.is_favorite ? colors.primaryEnd : 'transparent'}
                />
              </TouchableOpacity>

              {/* 제목 */}
              {editingId === item.id ? (
                <TextInput
                  style={styles.editInput}
                  value={editText}
                  onChangeText={setEditText}
                  autoFocus
                  onSubmitEditing={() => handleEditSave(item)}
                />
              ) : (
                <Text
                  style={[styles.title, isActive && styles.titleActive]}
                  numberOfLines={1}
                >
                  {displayTitle}
                </Text>
              )}

              {/* 액션 버튼 */}
              <View style={styles.actions}>
                {editingId === item.id ? (
                  <>
                    <TouchableOpacity onPress={() => handleEditSave(item)}>
                      <Check size={13} color={colors.primaryMid} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingId(null)}>
                      <X size={13} color={colors.textDisabled} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={(e) => handleEditStart(e, item)}>
                      <Pencil size={13} color={colors.textDisabled} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={(e) => handleDelete(e, item)}>
                      <Trash2 size={13} color={colors.textDisabled} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    flexShrink: 0,
  },
  header: {
    ...textStyles.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scroll: {
    padding: spacing.xs,
    gap: spacing.xs,
  },
  empty: {
    ...textStyles.caption,
    color: colors.textDisabled,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  itemActive: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  starBtn: { padding: 2 },
  title: {
    ...textStyles.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  titleActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
