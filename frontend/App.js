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
import InterviewScreen        from './src/screens/InterviewScreen';
import ReportScreen          from './src/screens/ReportScreen';
import AggregateReportScreen from './src/screens/AggregateReportScreen';
// GenerateScreen 제거 — CreateScreen에 통합됨

const Stack = createNativeStackNavigator();

// 브라우저 뒤로가기 연동을 위한 linking 설정
const linking = {
  prefixes: [],
  config: {
    screens: {
      Intro:           '',
      Create:          'create',
      Questions:       'questions',
      Interview:       'interview/:token',
      Report:          'report/:reportId',
      AggregateReport: 'report/aggregate/:questionListId',
    },
  },
};

// NavBar를 숨길 라우트
const HIDDEN_NAVBAR_ROUTES = new Set(['Interview', 'Report', 'AggregateReport']);

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
  const [currentRoute, setCurrentRoute] = React.useState(() => {
    // 직접 URL 접근 시 onStateChange가 초기 렌더에서 발화하지 않으므로
    // window.location.pathname으로 초기값 결정
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/interview/')) return 'Interview';
      if (path.startsWith('/report/'))   return 'Report';
      if (path.startsWith('/create'))    return 'Create';
      if (path.startsWith('/questions')) return 'Questions';
    }
    return 'Intro';
  });

  useEffect(() => { initAuth(); }, []);

  function handleLogoPress() {
    if (navRef.isReady()) {
      navRef.navigate('Intro');
    }
  }

  const showNavBar = !HIDDEN_NAVBAR_ROUTES.has(currentRoute);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <View style={{ flex: 1, backgroundColor: colors.background }}>

          {/* NavBar — Interview 화면 제외하고 표시 */}
          {showNavBar && <NavBar onLogoPress={handleLogoPress} />}

          <NavigationContainer
            ref={navRef}
            documentTitle={{ enabled: false }}
            linking={linking}
            onStateChange={(state) => {
              const route = state?.routes?.[state.index];
              if (route?.name) setCurrentRoute(route.name);
            }}
          >
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
              <Stack.Screen name="Interview"       component={InterviewScreen} />
              <Stack.Screen name="Report"          component={ReportScreen} />
              <Stack.Screen name="AggregateReport" component={AggregateReportScreen} />
            </Stack.Navigator>
          </NavigationContainer>

        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}