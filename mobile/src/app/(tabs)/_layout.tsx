import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  return (
    // ponytail: iconColor.selected = 액티브 탭 그린 tint (iOS/Android 공통 prop — design §4 탭바)
    <NativeTabs iconColor={{ selected: C.success }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="records">
        <NativeTabs.Trigger.Label>기록</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
