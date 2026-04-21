import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, radius, textStyles, shadows } from '../theme';

export default function InterviewLinkModal({ visible, url, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
    } catch (_) {
      try { await navigator.clipboard.writeText(url); } catch (__) {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setCopied(false);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Interview Link</Text>

          <View style={styles.urlBox}>
            <Text style={styles.urlText} numberOfLines={1} selectable>
              {url || 'Link not available'}
            </Text>
          </View>

          {url && (
            <TouchableOpacity
              style={[styles.btnPrimary, copied && styles.btnCopied]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>
                {copied ? 'Copied!' : 'Copy Link'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.btnClose} onPress={handleClose}>
            <Text style={styles.btnCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
    ...shadows.card,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  urlBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.primary,
    lineHeight: 20,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnCopied: {
    backgroundColor: colors.success,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  btnClose: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnCloseText: {
    fontSize: 14,
    color: colors.textDisabled,
  },
});
