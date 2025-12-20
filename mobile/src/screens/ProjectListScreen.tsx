import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useProjects, MobileProject } from "../hooks/useProjects";

const gradients = [
  ["#2563eb", "#3b82f6"],
  ["#10b981", "#22c55e"],
  ["#f97316", "#fb923c"],
  ["#8b5cf6", "#a855f7"],
];

const getGradient = (index: number) => gradients[index % gradients.length];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
};

type ProjectListScreenProps = NativeStackScreenProps<RootStackParamList, "Projects">;

export const ProjectListScreen = ({ navigation }: ProjectListScreenProps) => {
  const { projects, loading, refreshing, error, refresh } = useProjects();

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Project Stories</Text>
        <Text style={styles.subtitle}>Tap a project to view the latest action.</Text>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList<MobileProject>
        data={projects}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={projects.length === 0 ? styles.emptyContainer : styles.listContent}
        renderItem={({ item, index }) => {
          const [startColor, endColor] = getGradient(index);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("Timeline", { projectId: item.id, projectName: item.name })}
            >
              <View style={[styles.avatar, { backgroundColor: startColor }]}> 
                <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.reference_id ? <Text style={styles.cardSubtitle}>#{item.reference_id}</Text> : null}
                {item.project_manager ? <Text style={styles.cardMeta}>Lead: {item.project_manager}</Text> : null}
                <View style={styles.cardPillRow}>
                  <View style={[styles.cardPill, { backgroundColor: endColor }]}> 
                    <Text style={styles.cardPillText}>Active</Text>
                  </View>
                  {item.color ? (
                    <View style={[styles.cardColor, { backgroundColor: item.color }]} />
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>You have not been invited to any projects yet.</Text>}
      />
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
    paddingTop: 16,
    paddingBottom: 8,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#475569",
  },
  cardMeta: {
    fontSize: 12,
    color: "#64748b",
  },
  cardPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  cardPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  cardPillText: {
    color: "#F8FAFF",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  cardColor: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#F8FAFF",
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#ef4444",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFF",
  },
});

export default ProjectListScreen;
