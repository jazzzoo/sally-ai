// frontend/src/components/SlidePanel.js
// 슬라이드 다운/업 애니메이션 래퍼
// QuestionsScreen의 인라인 편집 패널에 사용
// 필요 시 다른 화면에서도 재사용 가능
//
// Props:
//   open          bool      열림/닫힘 상태
//   children      node      내부 콘텐츠
//   maxHeight     number    최대 높이 (기본 600, 콘텐츠에 맞게 조정)
//   duration      number    애니메이션 시간 ms (기본 300)

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function SlidePanel({
  open,
  children,
  maxHeight = 1200,
  duration = 300,
}) {
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration,
      useNativeDriver: false,
    }).start();
  }, [open]);

  const animatedMaxHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxHeight],
  });

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={{
        maxHeight: animatedMaxHeight,
        opacity: anim,
        overflow: 'hidden',
      }}
    >
      {children}
    </Animated.View>
  );
}