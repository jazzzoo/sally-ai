// frontend/src/components/LegalModal.js
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal,
} from 'react-native';
import { colors, spacing, radius, textStyles } from '../theme';
import { X } from 'lucide-react-native';

const PRIVACY_POLICY = `Effective Date: April 6, 2026
Operated by: ráfl
Contact: orangesbdj@gmail.com

1. Information We Collect
- Session inputs: Business summary, persona, style preferences you enter to generate interview questions
- Anonymous Guest ID: A randomly generated identifier stored locally in your browser. No account or registration required.
- Usage data: Basic server logs for service maintenance
- We do not collect your name or email unless you voluntarily provide it via our feedback form.
- Please do not include sensitive personal data in your inputs.

2. How We Use Your Information
- To generate and store your interview question lists
- To improve Nitor8's AI prompts and product features
- To respond to feedback or support requests
- We do not sell, rent, or share your data with third parties for marketing purposes.

3. Third-Party Services
Your inputs are processed by the following third-party services:
- Anthropic Claude API: Your session inputs are sent to Anthropic to generate AI responses. Nitor8 does not use your inputs to train AI models. See anthropic.com/privacy
- Render: Backend hosting
- Railway: Database hosting
- Vercel: Frontend hosting

4. Data Retention
- Your question lists are stored until you delete them or request deletion.
- Your Guest ID is stored locally and can be cleared by clearing your browser storage.
- To request deletion, contact orangesbdj@gmail.com

5. Your Rights
You have the right to access, correct, or delete your data. Contact orangesbdj@gmail.com.

6. California Residents (CCPA)
We do not sell your personal data. Contact orangesbdj@gmail.com for requests.

7. European Users (GDPR)
EEA users have additional rights including data portability. Contact orangesbdj@gmail.com.

8. Children's Privacy
Nitor8 does not knowingly collect data from children under 13.

9. Changes
We may update this policy at any time. Continued use constitutes acceptance.

10. Contact
orangesbdj@gmail.com`;

const TERMS_OF_SERVICE = `Effective Date: April 6, 2026
Operated by: ráfl
Contact: orangesbdj@gmail.com

1. Acceptance of Terms
By using Nitor8, you agree to these Terms. If you do not agree, do not use the service.

2. Beta Service Notice
Nitor8 is currently in beta. The service:
- May contain bugs, errors, or unexpected behavior
- May experience downtime or data loss without notice
- May have features added, modified, or removed at any time
Use of Nitor8 during beta is at your own risk.

3. What Nitor8 Does
Nitor8 generates customer interview questions using AI. Generated questions are suggestions only. You are solely responsible for reviewing and using any AI-generated content.

4. AI-Generated Content Disclaimer
- AI-generated content is provided "AS IS" without warranties.
- Nitor8 does not guarantee accuracy or suitability of generated questions.
- You are solely responsible for decisions made based on AI-generated content.

5. License to Use
ráfl grants you a limited, non-exclusive, non-transferable, revocable license to use Nitor8 for personal or internal business purposes.

6. Acceptable Use
You agree not to:
- Use Nitor8 for illegal or unauthorized purposes
- Attempt to reverse engineer or exploit the service
- Submit harmful or malicious content as input
- Attempt prompt injection or adversarial attacks

7. Beta Participation
By using Nitor8 during beta, you agree that feedback you provide may be used freely by ráfl to improve the service.

8. Termination
ráfl may suspend or terminate your access at any time, for any reason, without notice.

9. Limitation of Liability
To the maximum extent permitted by law:
- Nitor8 is provided "AS IS" and "AS AVAILABLE"
- ráfl shall not be liable for any indirect, incidental, or consequential damages
- ráfl's total liability shall not exceed $0 during the free beta period

10. Governing Law
These Terms are governed by the laws of the State of Delaware, United States.

11. Changes
We may update these Terms at any time. Continued use constitutes acceptance.

12. Contact
orangesbdj@gmail.com`;

export default function LegalModal({ visible, type, onClose }) {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const content = isPrivacy ? PRIVACY_POLICY : TERMS_OF_SERVICE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.wrapper}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.content}>{content}</Text>
          </ScrollView>
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
    padding: spacing.lg,
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scroll: {
    padding: spacing.lg,
  },
  content: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 22,
    paddingBottom: spacing.xl,
  },
});