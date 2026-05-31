import { Link, router } from 'expo-router'
import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'

const SignUpScreen: React.FC = () => {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (): Promise<void> => {
    setError(undefined)
    setSubmitting(true)
    try {
      const result = await signUp(email, password)
      if (result.status === 'OK') {
        router.replace('/todos')
      } else if (result.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
        setError('An account with that email already exists')
      } else if (result.formFields?.[0]) {
        setError(result.formFields[0].error)
      } else {
        setError('Failed to sign up')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.container} testID="signUpScreen">
      <Text style={styles.title}>Sign up</Text>
      <TextInput
        testID="signUpEmailInput"
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="signUpPasswordInput"
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        // Weird hack to prevent iOS from covering up the password, which breaks Maestro's input
        textContentType="oneTimeCode"
        autoComplete="off"
        value={password}
        onChangeText={setPassword}
      />
      {error && (
        <Text testID="authError" style={styles.error}>
          {error}
        </Text>
      )}
      <Pressable testID="submitSignUp" style={styles.button} onPress={() => void onSubmit()} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Signing up...' : 'Sign up'}</Text>
      </Pressable>
      <Link testID="goToLogIn" href="/logIn" style={styles.link}>
        Already have an account? Log in
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#1f6feb', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  error: { color: 'red' },
  link: { color: '#1f6feb', marginTop: 12, textAlign: 'center' },
})

export default SignUpScreen
