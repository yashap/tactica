import { type Todo } from '@tactica/tactica-core-contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { tacticaCoreClient } from '../../apiClient/tacticaCoreClient'
import { useAuth } from '../../auth/AuthContext'

const TodosScreen: React.FC = () => {
  const queryClient = useQueryClient()
  const { signOut } = useAuth()
  const [newTitle, setNewTitle] = useState('')

  const todosQuery = useQuery({
    queryKey: ['todos'],
    queryFn: () => tacticaCoreClient.todos.list(),
  })

  const createMutation = useMutation({
    mutationFn: (title: string) => tacticaCoreClient.todos.create({ title }),
    onSuccess: async () => {
      setNewTitle('')
      await queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tacticaCoreClient.todos.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const onAdd = (): void => {
    const title = newTitle.trim()
    if (!title) return
    createMutation.mutate(title)
  }

  const onLogOut = async (): Promise<void> => {
    await signOut()
    router.replace('/logIn')
  }

  return (
    <View style={styles.container} testID="todosScreen">
      <View style={styles.header}>
        <Text style={styles.title}>Your todos</Text>
        <Pressable testID="logOutButton" onPress={() => void onLogOut()} style={styles.logOutButton}>
          <Text style={styles.logOutText}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="newTodoInput"
          style={styles.input}
          placeholder="What's next?"
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={onAdd}
        />
        <Pressable testID="addTodoButton" style={styles.addButton} onPress={onAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {todosQuery.isLoading && <ActivityIndicator />}
      {todosQuery.error && <Text style={styles.error}>{(todosQuery.error as Error).message}</Text>}
      {todosQuery.data?.length === 0 && (
        <Text testID="emptyState" style={styles.empty}>
          No todos yet — add one above.
        </Text>
      )}

      <FlatList
        testID="todoList"
        data={todosQuery.data ?? []}
        keyExtractor={(item: Todo) => item.id}
        renderItem={({ item }) => (
          <TodoRow
            todo={item}
            onDelete={() => deleteMutation.mutate(item.id)}
            onChange={async () => {
              await queryClient.invalidateQueries({ queryKey: ['todos'] })
            }}
          />
        )}
      />
    </View>
  )
}

const TodoRow: React.FC<{ todo: Todo; onDelete: () => void; onChange: () => Promise<void> }> = ({
  todo,
  onDelete,
  onChange,
}) => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(todo.title)

  const updateMutation = useMutation({
    mutationFn: (patch: { title?: string; done?: boolean }) => tacticaCoreClient.todos.update(todo.id, patch),
    onSuccess: async () => {
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['todos'] })
      await onChange()
    },
  })

  if (editing) {
    return (
      <View style={styles.row}>
        <TextInput
          testID={`editTodoInput-${todo.id}`}
          style={[styles.input, { flex: 1 }]}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => updateMutation.mutate({ title })}
        />
        <Pressable
          testID={`saveTodo-${todo.id}`}
          style={styles.rowButton}
          onPress={() => updateMutation.mutate({ title })}
        >
          <Text>Save</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.row} testID={`todoRow-${todo.id}`}>
      <Pressable
        testID={`toggleDone-${todo.id}`}
        style={styles.checkbox}
        onPress={() => updateMutation.mutate({ done: !todo.done })}
      >
        <Text>{todo.done ? '☑︎' : '☐'}</Text>
      </Pressable>
      <Text testID={`todoTitle-${todo.id}`} style={[styles.todoTitle, todo.done && styles.todoDone]}>
        {todo.title}
      </Text>
      <Pressable testID={`editTodo-${todo.id}`} style={styles.rowButton} onPress={() => setEditing(true)}>
        <Text>Edit</Text>
      </Pressable>
      <Pressable testID={`deleteTodo-${todo.id}`} style={styles.rowButton} onPress={onDelete}>
        <Text>Delete</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  logOutButton: { padding: 8 },
  logOutText: { color: '#1f6feb' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, fontSize: 16, flex: 1 },
  addButton: { backgroundColor: '#1f6feb', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 6 },
  addButtonText: { color: 'white', fontWeight: '600' },
  empty: { color: '#666', textAlign: 'center', marginTop: 16 },
  error: { color: 'red' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  checkbox: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  todoTitle: { fontSize: 16, flex: 1 },
  todoDone: { textDecorationLine: 'line-through', color: '#888' },
  rowButton: { paddingHorizontal: 8, paddingVertical: 6 },
})

export default TodosScreen
