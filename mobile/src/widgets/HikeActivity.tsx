// iOS Live Activity — 등반 중 잠금화면 + 다이나믹 아일랜드. expo-widgets가 이 레이아웃을 SwiftUI로 생성.
// 디자인: "Rail Kilometer"(A) 베이스 + 두꺼운 진행 바(B). 히어로 = 진행 라인 — 온 거리(초록 채움)/남은 거리(트랙)를
// 양 끝 km가 잡아줘 "얼마나 왔고 남았는지"가 좌→우 즉독. 토큰은 앱 SSOT(theme.ts) Summit Precision 다크.
// 'widget' 지시어 함수는 babel-preset-expo가 별도 위젯 번들로 추출한다 → 함수 바깥의 헬퍼/상수는 위젯 런타임에
// 존재하지 않아 compose failure가 난다. 따라서 색상 상수·서브뷰를 전부 함수 안에 인라인한다(문서 예제 패턴).
// 표시 전용 — 값은 hikeWidget.formatHikeWidget이 만든 문자열. 인증·판정과 무관(03 불변).
import { Divider, Gauge, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, clipShape, font, foregroundStyle, frame, gaugeStyle, monospacedDigit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type HikeActivityProps = {
  courseName: string;
  elapsedLabel: string; // "1시간 23분"
  doneKm: string; // "1.2"
  remainingKm: string; // "0.8"
  progressPct: number; // 0..100
  etaLabel: string | null; // "14:30" (KST) — null이면 "—"
  altitudeLabel: string | null; // "512m" — null이면 "—"
  arrived: boolean;
};

const HikeActivity = (props: HikeActivityProps, _env: LiveActivityEnvironment) => {
  'widget';
  // Summit Precision 토큰(theme.ts). 위젯 번들엔 모듈 상수가 안 들어오므로 함수 안에 인라인.
  const green = '#2ECC71'; // verified/success — 진행 채움 = 보상 색
  const ink = '#F8F9FA'; // Cloud White — 값/제목
  const body = '#E2E2E5'; // 본문
  const faint = '#9BA1A6'; // 라벨/보조
  const onGreen = '#0E1F14'; // 초록 알약 위 다크 텍스트
  const frac = Math.max(0, Math.min(1, props.progressPct / 100));

  // 잠금화면 배너 — 도착 시엔 인증 유도(B의 풀그린 알약)로 전환. 위젯 내 인증 버튼 없음(스펙).
  const banner = props.arrived ? (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 14 })]}>
      <Text modifiers={[font({ weight: 'bold', size: 17 }), foregroundStyle(green)]}>정상 도착 🎉</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(body)]}>앱을 열어 완등을 인증하세요</Text>
      <Text
        modifiers={[
          font({ weight: 'bold', size: 14, design: 'monospaced' }),
          foregroundStyle(onGreen),
          padding({ top: 6, bottom: 6, leading: 14, trailing: 14 }),
          frame({ maxWidth: 10000 }),
          background(green),
          clipShape('capsule'),
        ]}
      >
        완주 {props.doneKm}km  ✓
      </Text>
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 14 })]}>
      <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(ink)]}>{props.courseName}</Text>
      {/* 들머리 → 정상 아이콘 = 공짜 길잡이 */}
      <HStack>
        <Image systemName="figure.hiking" color={faint} />
        <Spacer />
        <Image systemName="mountain.2.fill" color={faint} />
      </HStack>
      {/* 히어로 라인 — 온 거리(초록)·[두꺼운 게이지]·남은 거리(흰색) */}
      <HStack spacing={10} alignment="center">
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ weight: 'bold', size: 18, design: 'monospaced' }), monospacedDigit(), foregroundStyle(green)]}>{props.doneKm}</Text>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>온 KM</Text>
        </VStack>
        <Gauge value={frac} modifiers={[tint(green), gaugeStyle('linearCapacity'), frame({ maxWidth: 10000 })]} />
        <VStack alignment="trailing" spacing={1}>
          <Text modifiers={[font({ weight: 'bold', size: 18, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.remainingKm}</Text>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>남은 KM</Text>
        </VStack>
      </HStack>
      <Divider />
      {/* 모노 스탯 — 경과 · 정상 ETA · 고도 · 진행% (2차 정보) */}
      <HStack>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>경과</Text>
          <Text modifiers={[font({ weight: 'bold', size: 13, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.elapsedLabel}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>정상 ETA</Text>
          <Text modifiers={[font({ weight: 'bold', size: 13, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.etaLabel ?? '—'}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>고도</Text>
          <Text modifiers={[font({ weight: 'bold', size: 13, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.altitudeLabel ?? '—'}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Text modifiers={[font({ size: 9, weight: 'medium' }), foregroundStyle(faint)]}>진행</Text>
          <Text modifiers={[font({ weight: 'bold', size: 13, design: 'monospaced' }), monospacedDigit(), foregroundStyle(green)]}>{props.progressPct}%</Text>
        </VStack>
      </HStack>
    </VStack>
  );

  return {
    banner,
    compactLeading: <Image systemName={props.arrived ? 'flag.checkered' : 'figure.hiking'} color={green} />,
    compactTrailing: (
      <Text modifiers={[font({ weight: 'semibold', size: 13, design: 'monospaced' }), monospacedDigit(), foregroundStyle(green)]}>
        {props.arrived ? '도착' : `${props.progressPct}%`}
      </Text>
    ),
    minimal: <Image systemName="figure.hiking" color={green} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 8 })]}>
        <Image systemName="figure.hiking" color={green} />
        <Text modifiers={[font({ size: 12, design: 'monospaced' }), monospacedDigit(), foregroundStyle(faint)]}>{props.elapsedLabel}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ all: 8 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 18, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.remainingKm}km</Text>
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(faint)]}>남은 거리</Text>
      </VStack>
    ),
    expandedCenter: <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle(green)]}>{props.courseName}</Text>,
    expandedBottom: props.arrived ? (
      <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle(green)]}>정상 도착 — 앱에서 인증하세요</Text>
    ) : (
      <HStack spacing={10} alignment="center" modifiers={[padding({ top: 2, bottom: 2, leading: 4, trailing: 4 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 14, design: 'monospaced' }), monospacedDigit(), foregroundStyle(green)]}>{props.doneKm}</Text>
        <Gauge value={frac} modifiers={[tint(green), gaugeStyle('linearCapacity'), frame({ maxWidth: 10000 })]} />
        <Text modifiers={[font({ weight: 'bold', size: 14, design: 'monospaced' }), monospacedDigit(), foregroundStyle(ink)]}>{props.remainingKm}</Text>
      </HStack>
    ),
  };
};

export default createLiveActivity<HikeActivityProps>('HikeActivity', HikeActivity);
