import { isWaitingForStudent, isWaitingForTeacher } from '@cuadrilo/shared/api';
import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Container,
  Group,
  Menu,
  NavLink,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBook,
  IconChalkboard,
  IconChevronRight,
  IconFolder,
  IconHome,
  IconLanguage,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLock,
  IconLogout,
  IconNotebook,
  IconPalette,
  IconPlugConnected,
  IconPresentation,
  IconUsers,
} from '@tabler/icons-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useMatch } from 'react-router';

import { useAuth } from './auth';
import BoardPage from './board/BoardPage';
import { AppearanceDialog, useCanChooseScheme } from './components/AppearanceDialog';
import { BrandLogo } from './components/BrandLogo';
import { ClassAlert } from './components/ClassAlert';
import { CountBadge } from './components/CountBadge';
import { LiveNotices } from './components/LiveNotices';
import { t } from './i18n';
import { useIsCompact, useIsMobile } from './layout/useIsMobile';
import { MOBILE_BELOW } from './layout/viewport';
import { LiveProvider, useLive } from './liveConnection';
import AssignHomework from './pages/AssignHomework';
import AssistantConsent from './pages/AssistantConsent';
import AssistantsPage from './pages/AssistantsPage';
import ClassPage from './pages/ClassPage';
import Dashboard from './pages/Dashboard';
import HomeworkPage from './pages/HomeworkPage';
import HomeworkReview from './pages/HomeworkReview';
import LessonEditor from './pages/LessonEditor';
import LessonPlayer from './pages/LessonPlayer';
import Login from './pages/Login';
import MediaPage from './pages/MediaPage';
import PrivacyPage from './pages/PrivacyPage';
import StudentHome from './pages/StudentHome';
import StudentHomework from './pages/StudentHomework';
import Students from './pages/Students';
import TeacherHome from './pages/TeacherHome';
import VocabularyPage from './pages/VocabularyPage';
import { lessonsPath } from './paths';

const notFound = (
  <Text>
    {t('common.notFound')}{' '}
    <Anchor component={Link} to="/">
      {t('common.backHome')}
    </Anchor>
  </Text>
);

const NAV_WIDE = 260;
const NAV_MINI = 76;
const NAV_MINI_KEY = 'nav-mini';

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: typeof IconBook;
  badge?: ReactNode;
};

function readNavMini(): boolean {
  try {
    return localStorage.getItem(NAV_MINI_KEY) === '1';
  } catch {
    return false;
  }
}

function writeNavMini(mini: boolean): void {
  try {
    localStorage.setItem(NAV_MINI_KEY, mini ? '1' : '0');
  } catch {
    // blocked storage: the choice lasts for this visit only
  }
}

/**
 * Student: a small "En clase" mark while their class is on (opens its lesson).
 * In the collapsed navbar the words hide and the same dot sits on the avatar.
 */
function InClassMark({ iconsOnly }: { iconsOnly: boolean }) {
  const { studentClass } = useLive();
  if (!studentClass?.lessonId) return null;
  const to = `/lessons/${studentClass.lessonId}`;
  if (iconsOnly) {
    return (
      <span className="nav-avatar-live">
        <Tooltip label={t('nav.inClass')} position="right" withArrow openDelay={300}>
          <Link to={to} className="nav-avatar-live-link" aria-label={t('nav.inClass')}>
            <span className="live-dot small" aria-hidden />
          </Link>
        </Tooltip>
      </span>
    );
  }
  return (
    <div className="nav-in-class">
      <Badge
        component={Link}
        to={to}
        variant="light"
        leftSection={<span className="live-dot small" aria-hidden />}
        style={{ cursor: 'pointer' }}
      >
        {t('nav.inClass')}
      </Badge>
    </div>
  );
}

/**
 * How many homework wait for the user (the student's turn: to do or correct;
 * the teacher's: to review), live from the shared list.
 */
function usePendingHomeworkCount(forTeacher: boolean): number {
  const { homework } = useLive();
  return useMemo(() => {
    const isUsersTurn = forTeacher ? isWaitingForTeacher : isWaitingForStudent;
    let pending = 0;
    for (const item of homework ?? []) if (isUsersTurn(item.status)) pending += 1;
    return pending;
  }, [homework, forTeacher]);
}

/**
 * The count on a nav item. A component of its own, so only the badge follows the live homework list:
 * the shell (and the page inside it) does not render again at every homework event.
 */
function PendingBadge({ forTeacher }: { forTeacher: boolean }) {
  const pending = usePendingHomeworkCount(forTeacher);
  if (pending === 0) return null;
  return (
    <CountBadge
      count={pending}
      label={
        forTeacher ? t('notices.toReviewCount', { count: pending }) : t('notices.pendingCount', { count: pending })
      }
    />
  );
}

export default function App() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Public: readable before signing in.
  if (pathname === '/privacy') return <PrivacyPage />;
  if (user === undefined) {
    return (
      <Text c="dimmed" p="md">
        Cargando…
      </Text>
    );
  }
  if (user === null) return <Login />;

  // One live-class connection for the whole signed-in session.
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  );
}

/** A left-navbar link; `end` keeps "/" from lighting up on every page. */
function SideNavLink({ item, iconsOnly, onNavigate }: { item: NavItem; iconsOnly: boolean; onNavigate: () => void }) {
  const match = useMatch({ path: item.to, end: item.end ?? false });
  const Icon = item.icon;
  const link = (
    <NavLink
      component={Link}
      to={item.to}
      active={!!match}
      aria-current={match ? 'page' : undefined}
      label={iconsOnly ? undefined : item.label}
      leftSection={<Icon size={18} stroke={1.5} />}
      rightSection={iconsOnly ? undefined : item.badge}
      className={iconsOnly ? 'nav-side-link mini' : 'nav-side-link'}
      onClick={onNavigate}
      aria-label={iconsOnly ? item.label : undefined}
    />
  );
  if (!iconsOnly) return link;
  return (
    <Tooltip label={item.label} position="right" withArrow openDelay={300}>
      <div className="nav-side-link-wrap">
        {link}
        {item.badge && <span className="nav-mini-badge">{item.badge}</span>}
      </div>
    </Tooltip>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const [mini, setMini] = useState(readNavMini);
  const [appearanceOpen, appearance] = useDisclosure(false);
  const canChooseScheme = useCanChooseScheme();
  // Desktop only: on a phone the navbar is a full-width overlay with labels (one switch for the whole platform).
  const isDesktop = !useIsMobile();
  const compact = useIsCompact();
  const iconsOnly = (!!mini || compact) && isDesktop;

  // A route change closes the overlay navbar (mobile / narrow window).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    closeNav();
  }, [pathname, closeNav]);

  const toggleMini = () => {
    setMini((was) => {
      const next = !was;
      writeNavMini(next);
      return next;
    });
  };

  if (!user) return null;
  const isTeacher = user.role === 'teacher';
  const pendingBadge = <PendingBadge forTeacher={isTeacher} />;
  const links: NavItem[] = isTeacher
    ? [
        { to: '/', end: true, label: t('nav.home'), icon: IconHome },
        { to: lessonsPath, label: t('nav.lessons'), icon: IconBook },
        { to: '/class', label: t('nav.class'), icon: IconPresentation },
        { to: '/homework', label: t('nav.homework'), icon: IconNotebook, badge: pendingBadge },
        { to: '/files', label: t('nav.files'), icon: IconFolder },
        { to: '/students', label: t('nav.students'), icon: IconUsers },
      ]
    : [
        { to: '/', end: true, label: t('nav.home'), icon: IconHome },
        { to: '/homework', label: t('nav.homework'), icon: IconNotebook, badge: pendingBadge },
        { to: lessonsPath, label: t('nav.lessons'), icon: IconBook },
        { to: '/pizarra', label: t('nav.board'), icon: IconChalkboard },
        { to: '/vocabulario', label: t('nav.vocabulary'), icon: IconLanguage },
      ];

  return (
    <AppShell
      // Header only on a narrow window (burger); on desktop the logo lives in the navbar.
      header={{ height: 56, collapsed: isDesktop }}
      navbar={{
        width: iconsOnly ? NAV_MINI : NAV_WIDE,
        breakpoint: MOBILE_BELOW,
        collapsed: { mobile: !navOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" gap="md" wrap="nowrap">
          <Burger opened={navOpened} onClick={toggleNav} size="sm" aria-label={t('nav.menu')} />
          <BrandLogo link onNavigate={closeNav} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" withBorder={false} className={iconsOnly ? 'app-navbar mini' : 'app-navbar'}>
        {/* Logo only on desktop: on mobile it already sits in the header. */}
        {(iconsOnly || isDesktop) && (
          <AppShell.Section mb="sm">
            {iconsOnly ? (
              // A window too narrow for the full menu has nothing to expand to.
              !compact && (
                <Group justify="center">
                  <Tooltip label={t('nav.expand')} position="right" withArrow>
                    <ActionIcon variant="subtle" color="gray" onClick={toggleMini} aria-label={t('nav.expand')}>
                      <IconLayoutSidebarLeftExpand size={18} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )
            ) : (
              <Group gap="xs" wrap="nowrap" justify="space-between" align="flex-start">
                <BrandLogo link onNavigate={closeNav} />
                <Tooltip label={t('nav.collapse')} position="right" withArrow>
                  <ActionIcon variant="subtle" color="gray" onClick={toggleMini} aria-label={t('nav.collapse')} mt={2}>
                    <IconLayoutSidebarLeftCollapse size={18} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </AppShell.Section>
        )}

        <AppShell.Section grow component="nav">
          {links.map((link) => (
            <SideNavLink key={link.to} item={link} iconsOnly={iconsOnly} onNavigate={closeNav} />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <div className={iconsOnly ? 'nav-account mini' : 'nav-account'}>
            {!isTeacher && <InClassMark iconsOnly={iconsOnly} />}
            <Menu position="top-end" withinPortal width={iconsOnly ? 220 : 'target'}>
              <Menu.Target>
                <UnstyledButton className={iconsOnly ? 'nav-profile mini' : 'nav-profile'} aria-label={user.login}>
                  <Group gap="sm" wrap="nowrap" justify={iconsOnly ? 'center' : undefined}>
                    <Avatar
                      radius="md"
                      size={36}
                      styles={{
                        root: {
                          '--avatar-bg': 'var(--accent-avatar)',
                          '--avatar-color': 'var(--accent-sage-contrast)',
                        },
                      }}
                    >
                      {user.login.slice(0, 1).toUpperCase()}
                    </Avatar>
                    {!iconsOnly && (
                      <>
                        <div className="nav-profile-text">
                          <Text size="sm" fw={500} truncate>
                            {user.login}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {isTeacher ? t('nav.roleTeacher') : t('nav.roleStudent')}
                          </Text>
                        </div>
                        <IconChevronRight size={14} stroke={1.5} className="nav-profile-chevron" />
                      </>
                    )}
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                {isTeacher && (
                  <Menu.Item component={Link} to="/assistants" leftSection={<IconPlugConnected size={16} />}>
                    {t('assistants.title')}
                  </Menu.Item>
                )}
                {(isTeacher || canChooseScheme) && (
                  <Menu.Item leftSection={<IconPalette size={16} />} onClick={appearance.open}>
                    {t('nav.appearance')}
                  </Menu.Item>
                )}
                <Menu.Item component={Link} to="/privacy" leftSection={<IconLock size={16} />}>
                  {t('privacy.link')}
                </Menu.Item>
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={logout}>
                  {t('nav.signOut')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="lg" pt={0} pb="md">
          {!isTeacher && <ClassAlert />}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path={lessonsPath} element={isTeacher ? <TeacherHome /> : <StudentHome />} />
            {/* An AI assistant asks for access (OAuth); signing in first if needed. */}
            <Route path="/oauth/consent" element={<AssistantConsent />} />
            <Route path="/lessons/:id" element={<LessonPlayer />} />
            <Route path="/lessons/:id/:chapter" element={<LessonPlayer />} />
            {!isTeacher && <Route path="/homework" element={<StudentHomework />} />}
            {!isTeacher && <Route path="/pizarra" element={<BoardPage />} />}
            {!isTeacher && <Route path="/vocabulario" element={<VocabularyPage />} />}
            {/* Teacher-only pages; the API enforces roles regardless of the UI. */}
            {isTeacher && (
              <>
                <Route path="/class" element={<ClassPage />} />
                <Route path="/lessons/:id/edit" element={<LessonEditor />} />
                <Route path="/lessons/:id/edit/:chapter" element={<LessonEditor />} />
                <Route path="/lessons/:id/homework/new" element={<AssignHomework />} />
                <Route path="/homework" element={<HomeworkPage />} />
                <Route path="/homework/:homeworkId" element={<HomeworkReview />} />
                <Route path="/homework/:homeworkId/edit" element={<AssignHomework />} />
                <Route path="/files" element={<MediaPage />} />
                <Route path="/assistants" element={<AssistantsPage />} />
                <Route path="/students" element={<Students />} />
              </>
            )}
            <Route path="*" element={notFound} />
          </Routes>
        </Container>
      </AppShell.Main>
      <LiveNotices />
      <AppearanceDialog opened={appearanceOpen} onClose={appearance.close} isTeacher={isTeacher} />
    </AppShell>
  );
}
