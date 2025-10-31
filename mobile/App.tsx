import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { useSupabaseAuth } from './src/hooks/useSupabaseAuth';
import LoginScreen from './src/screens/LoginScreen';
import ProjectListScreen from './src/screens/ProjectListScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import { RootStackParamList } from './src/types/navigation';
import { NotificationCenter, NotificationProvider } from './src/notifications/NotificationContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.loader}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <NotificationProvider>
      <NavigationContainer>
        <NotificationCenter />
        <Stack.Navigator
          screenOptions={{
            headerTitleAlign: 'center',
            animation: 'fade',
          }}
        >
          {session ? (
            <>
              <Stack.Screen name="Projects" component={ProjectListScreen} />
              <Stack.Screen
                name="Timeline"
                component={TimelineScreen}
                options={({ route }) => ({ title: route.params.projectName })}
              />
            </>
          ) : (
            <Stack.Screen
              name="Auth"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </NotificationProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFF',
  },
});
