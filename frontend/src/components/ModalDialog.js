// frontend/src/components/ModalDialog.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Modal,
} from 'react-native';
import { colors, spacing, radius, textStyles } from '../theme';

export default function ModalDialog({
  visible,
  title,
  message,
  mode = 'confirm', // 'confirm' | 'input'
  inputValue,
  onChangeInput,
  onConfirm,
  onCancel,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmColor,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      {/* 배경 딤 */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCancel}
      />

      {/* 모달 박스 */}
      <View style={styles.wrapper}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}

          {mode === 'input' && (
            <TextInput
              style={styles.input}
              value={inputValue}
              onChangeText={onChangeInput}
              autoFocus
              onSubmitEditing={onConfirm}
            />
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, confirmColor && { backgroundColor: confirmColor }]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 25, 36, 0.5)',
  },
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    width: 460,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
  },
  message: {
    ...textStyles.bodyS,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  input: {
    ...textStyles.caption,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    width: '100%',
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cancelText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryEnd,
  },
  confirmText: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
});