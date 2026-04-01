// frontend/App.js

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, useWindowDimensions } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import useStore        from './src/store/useStore';
import NavBar          from './src/components/NavBar';
import { colors }      from './src/theme';

import IntroScreen     from './src/screens/IntroScreen';
import CreateScreen    from './src/screens/CreateScreen';
import QuestionsScreen from './src/screens/QuestionsScreen';
// GenerateScreen 제거 — CreateScreen에 통합됨

const Stack = createNativeStackNavigator();

// 브라우저 뒤로가기 연동을 위한 linking 설정
const linking = {
  prefixes: [],
  config: {
    screens: {
      Intro:     '',
      Create:    'create',
      Questions: 'questions',
    },
  },
};

// 웹 스크롤바 커스텀 CSS 주입
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* 스크롤바 배경 = background 컬러 */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #DAE1ED;
    }
    ::-webkit-scrollbar-thumb {
      background: #C8D3E3;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #A8BAD9;
    }
    /* Firefox */
    * {
      scrollbar-color: #C8D3E3 #DAE1ED;
      scrollbar-width: thin;
    }
    /* 화살표 제거: webkit에서 버튼 높이 0 */
    ::-webkit-scrollbar-button {
      display: none;
      height: 0;
      width: 0;
    }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const initAuth = useStore((s) => s.initAuth);
  const navRef   = useNavigationContainerRef();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 640;

  useEffect(() => { initAuth(); }, []);

  function handleLogoPress() {
    if (navRef.isReady()) {
      navRef.navigate('Intro');
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <View style={{ flex: 1, backgroundColor: colors.background }}>

          {/* NavBar — 항상 표시 (로고 CTA + 동적 타이틀) */}
          <NavBar onLogoPress={handleLogoPress} />

          <NavigationContainer ref={navRef} linking={linking}>
            <Stack.Navigator
              initialRouteName="Intro"
              screenOptions={{
                headerShown:  false,
                contentStyle: { backgroundColor: colors.background },
                animation:    'slide_from_right',
              }}
            >
              <Stack.Screen name="Intro"     component={IntroScreen} />
              <Stack.Screen name="Create"    component={CreateScreen} />
              <Stack.Screen name="Questions" component={QuestionsScreen} />
            </Stack.Navigator>
          </NavigationContainer>

        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}