import { SafeAreaView, ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useTimeline } from "../hooks/useTimeline";

const EMPTY_FEED_MESSAGE = "No updates have been shared with this project yet.";

const randomPalette = ["#3b82f6", "#8b5cf6", "#f97316", "#10b981"];

const getAvatarColor = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return randomPalette[0];
  const charCode = trimmed.charCodeAt(0);
  return randomPalette[charCode % randomPalette.length];
};

const formatRelativeTime = (iso: string) => {
  const time = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - time.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return time.toLocaleDateString();
};

type TimelineScreenProps = NativeStackScreenProps<RootStackParamList, "Timeline">;

export const TimelineScreen = ({ route }: TimelineScreenProps) => {
  const { projectId, projectName } = route.params;
  const { timeline, loading, error } = useTimeline(projectId);

  const avatarInitial = projectName?.trim()?.charAt(0)?.toUpperCase() ?? "P";
  const avatarColor = getAvatarColor(projectName);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{projectName}</Text>
        <Text style={styles.subtitle}>Live project feed</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={timeline.length === 0 ? styles.emptyContainer : styles.feedContainer}>
          {timeline.length === 0 ? (
            <Text style={styles.emptyText}>{EMPTY_FEED_MESSAGE}</Text>
          ) : (
            timeline.map((entry) => (
              <View key={entry.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={styles.avatarText}>{avatarInitial}</Text>
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.cardTitle}>{projectName}</Text>
                    <Text style={styles.cardMeta}>{formatRelativeTime(entry.createdAt)}</Text>
                  </View>
                </View>
                <Text style={styles.cardBody}>{entry.body.trim() || "Shared an update with the team."}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardAction}>Appreciate</Text>
                  <Text style={styles.cardAction}>Discuss</Text>
                  <Text style={styles.cardAction}>Share</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFF",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
  },
  errorText: {
    fontSize: 13,
    color: "#ef4444",
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  feedContainer: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    padding: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    gap: 18,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  cardMeta: {
    fontSize: 12,
    color: "#94a3b8",
  },
  cardBody: {
    fontSize: 15,
    color: "#1f2937",
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  cardAction: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
  },
});

export default TimelineScreen;


