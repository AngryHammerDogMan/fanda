import { View, Text, Input, Image, ScrollView, Picker } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { dishAPI, authAPI } from '@/services/api'
import type { Dish, Ingredient, Step, BuddyGroup, DishPayload, PickerChangeEvent } from '@/types'
import './create.scss'

const DISH_TYPES = [
  { key: 'dish', label: '菜品' },
  { key: 'takeout', label: '外卖' },
  { key: 'dineout', label: '外食' },
]

const CATEGORIES = [
  '家常菜', '川菜', '粤菜', '湘菜', '鲁菜',
  '苏菜', '浙菜', '闽菜', '徽菜', '西餐',
  '日料', '韩餐', '东南亚', '火锅', '烧烤',
  '面食', '汤羹', '甜品', '饮品', '其他',
]

const DIFFICULTIES = [
  { value: 1, label: '简单' },
  { value: 2, label: '普通' },
  { value: 3, label: '困难' },
  { value: 4, label: '大师' },
]

const GROUP_TYPES = [
  { key: 'couple', label: '情侣' },
  { key: 'buddy', label: '饭搭子' },
]

const getPickerIndex = (event: PickerChangeEvent): number => {
  const { value } = event.detail
  const rawValue = Array.isArray(value) ? value[0] : value
  return Number(rawValue)
}

export default function DishCreate() {
  const router = useRouter()
  const { id } = router.params

  const isEdit = !!id

  // 表单状态
  const [dishType, setDishType] = useState('dish')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [duration, setDuration] = useState('')
  const [price, setPrice] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '' }])
  const [steps, setSteps] = useState<Step[]>([{ order: 1, description: '' }])
  const [tagsInput, setTagsInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [restaurant, setRestaurant] = useState('')
  const [restaurantNote, setRestaurantNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [groupType, setGroupType] = useState('couple')
  const [groupId, setGroupId] = useState('')
  const [buddyGroups, setBuddyGroups] = useState<BuddyGroup[]>([])
  const [submitting, setSubmitting] = useState(false)

  useDidShow(() => {
    if (isEdit && id) {
      loadDishDetail(id)
    }
    loadUserGroups()
  })

  const loadDishDetail = async (dishId: string) => {
    try {
      const res = await dishAPI.get(dishId)
      const dish = res.data as Dish
      setName(dish.name)
      setDishType(dish.dish_type)
      setCategory(dish.category)
      setDifficulty(dish.difficulty)
      setDuration(String(dish.duration || ''))
      setPrice(dish.price !== null ? String(dish.price) : '')
      setIngredients(dish.ingredients && dish.ingredients.length > 0 ? dish.ingredients : [{ name: '', amount: '' }])
      setSteps(dish.steps && dish.steps.length > 0 ? dish.steps : [{ order: 1, description: '' }])
      setTags(dish.tags || [])
      setRestaurant(dish.restaurant || '')
      setRestaurantNote(dish.restaurant_note || '')
      setPhotos(dish.photos || [])
      setGroupType(dish.group_type || 'couple')
      setGroupId(dish.group_id || '')
    } catch (err) {
      console.error('加载菜品失败', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    }
  }

  const loadUserGroups = async () => {
    try {
      const res = await authAPI.getProfile()
      const user = res.data
      if (user.buddy_groups) {
        setBuddyGroups(user.buddy_groups)
      }
    } catch (err) {
      // 忽略
    }
  }

  // 食材操作
  const handleIngredientChange = (index: number, field: 'name' | 'amount', value: string) => {
    const newIngredients = [...ingredients]
    newIngredients[index] = { ...newIngredients[index], [field]: value }
    setIngredients(newIngredients)
  }

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '' }])
  }

  const handleRemoveIngredient = (index: number) => {
    if (ingredients.length <= 1) return
    const newIngredients = ingredients.filter((_, i) => i !== index)
    setIngredients(newIngredients)
  }

  // 步骤操作
  const handleStepChange = (index: number, value: string) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], description: value }
    setSteps(newSteps)
  }

  const handleAddStep = () => {
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.order)) : 0
    setSteps([...steps, { order: maxOrder + 1, description: '' }])
  }

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return
    const newSteps = steps.filter((_, i) => i !== index)
    // 重新编号
    const reordered = newSteps.map((step, i) => ({ ...step, order: i + 1 }))
    setSteps(reordered)
  }

  // 标签操作
  const handleAddTag = () => {
    const tag = tagsInput.trim()
    if (!tag || tags.includes(tag)) return
    setTags([...tags, tag])
    setTagsInput('')
  }

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  // 图片上传
  const handleChooseImage = () => {
    Taro.chooseImage({
      count: 9 - photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 实际项目中需要先上传到服务器获取 URL
        setPhotos([...photos, ...res.tempFilePaths])
      },
    })
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index))
  }

  // 提交
  const handleSubmit = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请输入菜品名称', icon: 'none' })
      return
    }

    if (!groupType) {
      Taro.showToast({ title: '请选择分组类型', icon: 'none' })
      return
    }

    setSubmitting(true)

    const data: DishPayload = {
      dish_type: dishType,
      name: name.trim(),
      category,
      difficulty,
      duration: duration ? Number(duration) : 0,
      price: price ? Number(price) : null,
      ingredients: ingredients.filter(ing => ing.name.trim()),
      steps: steps.filter(step => step.description.trim()),
      tags,
      restaurant,
      restaurant_note: restaurantNote,
      photos,
      group_type: groupType,
      group_id: groupId || undefined,
    }

    try {
      if (isEdit && id) {
        await dishAPI.update(id, data)
        Taro.showToast({ title: '修改成功', icon: 'success' })
      } else {
        await dishAPI.create(data)
        Taro.showToast({ title: '添加成功', icon: 'success' })
      }
      setTimeout(() => {
        Taro.navigateBack()
      }, 1000)
    } catch (err) {
      console.error('提交失败', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCategoryChange = (e: PickerChangeEvent) => {
    setCategory(CATEGORIES[getPickerIndex(e)])
  }

  const handleDifficultyChange = (e: PickerChangeEvent) => {
    setDifficulty(DIFFICULTIES[getPickerIndex(e)].value)
  }

  const handleGroupTypeChange = (e: PickerChangeEvent) => {
    setGroupType(GROUP_TYPES[getPickerIndex(e)].key)
    setGroupId('')
  }

  const handleBuddyGroupChange = (e: PickerChangeEvent) => {
    const index = getPickerIndex(e)
    if (buddyGroups[index]) {
      setGroupId(buddyGroups[index].id)
    }
  }

  const getCategoryIndex = () => {
    return CATEGORIES.indexOf(category)
  }

  const getDifficultyIndex = () => {
    if (difficulty === null) return -1
    return DIFFICULTIES.findIndex(d => d.value === difficulty)
  }

  const getGroupTypeIndex = () => {
    return GROUP_TYPES.findIndex(g => g.key === groupType)
  }

  const getBuddyGroupIndex = () => {
    return buddyGroups.findIndex(g => g.id === groupId)
  }

  return (
    <View className='page-create'>
      <ScrollView className='form-scroll' scrollY>
        <View className='form-container'>
          {/* 菜品类型 */}
          <View className='form-section'>
            <Text className='section-label'>菜品类型</Text>
            <View className='type-selector'>
              {DISH_TYPES.map(item => (
                <View
                  key={item.key}
                  className={`type-item ${dishType === item.key ? 'active' : ''}`}
                  onClick={() => setDishType(item.key)}
                >
                  <Text className='type-text'>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 名称 */}
          <View className='form-section'>
            <Text className='section-label'>菜品名称</Text>
            <View className='input-wrap'>
              <Input
                className='form-input'
                placeholder='请输入菜品名称'
                value={name}
                onInput={(e) => setName(e.detail.value)}
                maxlength={50}
              />
            </View>
          </View>

          {/* 分类 */}
          <View className='form-section'>
            <Text className='section-label'>菜品分类</Text>
            <Picker
              mode='selector'
              range={CATEGORIES}
              value={getCategoryIndex()}
              onChange={handleCategoryChange}
            >
              <View className='picker-wrap'>
                <Text className={category ? 'picker-value' : 'picker-placeholder'}>
                  {category || '请选择分类'}
                </Text>
                <Text className='picker-arrow'>›</Text>
              </View>
            </Picker>
          </View>

          {/* 难度 */}
          <View className='form-section'>
            <Text className='section-label'>难度等级</Text>
            <Picker
              mode='selector'
              range={DIFFICULTIES.map(d => d.label)}
              value={getDifficultyIndex()}
              onChange={handleDifficultyChange}
            >
              <View className='picker-wrap'>
                <Text className={difficulty !== null ? 'picker-value' : 'picker-placeholder'}>
                  {difficulty !== null ? DIFFICULTIES.find(d => d.value === difficulty)?.label : '请选择难度'}
                </Text>
                <Text className='picker-arrow'>›</Text>
              </View>
            </Picker>
          </View>

          {/* 耗时 */}
          <View className='form-section'>
            <Text className='section-label'>预计耗时（分钟）</Text>
            <View className='input-wrap'>
              <Input
                className='form-input'
                type='number'
                placeholder='请输入预计耗时'
                value={duration}
                onInput={(e) => setDuration(e.detail.value)}
              />
            </View>
          </View>

          {/* 价格 */}
          <View className='form-section'>
            <Text className='section-label'>参考价格（元）</Text>
            <View className='input-wrap'>
              <Input
                className='form-input'
                type='digit'
                placeholder='请输入参考价格'
                value={price}
                onInput={(e) => setPrice(e.detail.value)}
              />
            </View>
          </View>

          {/* 食材 */}
          <View className='form-section'>
            <View className='section-header'>
              <Text className='section-label'>食材清单</Text>
              <Text className='add-btn' onClick={handleAddIngredient}>+ 添加食材</Text>
            </View>
            {ingredients.map((ing, idx) => (
              <View key={idx} className='ingredient-row'>
                <View className='ingredient-input-wrap name'>
                  <Input
                    className='form-input'
                    placeholder='食材名称'
                    value={ing.name}
                    onInput={(e) => handleIngredientChange(idx, 'name', e.detail.value)}
                  />
                </View>
                <View className='ingredient-input-wrap amount'>
                  <Input
                    className='form-input'
                    placeholder='用量'
                    value={ing.amount}
                    onInput={(e) => handleIngredientChange(idx, 'amount', e.detail.value)}
                  />
                </View>
                {ingredients.length > 1 && (
                  <View className='remove-btn' onClick={() => handleRemoveIngredient(idx)}>
                    <Text className='remove-icon'>✕</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* 步骤 */}
          <View className='form-section'>
            <View className='section-header'>
              <Text className='section-label'>烹饪步骤</Text>
              <Text className='add-btn' onClick={handleAddStep}>+ 添加步骤</Text>
            </View>
            {steps.map((step, idx) => (
              <View key={idx} className='step-row'>
                <View className='step-number-wrap'>
                  <Text className='step-number'>{step.order}</Text>
                </View>
                <View className='step-input-wrap'>
                  <Input
                    className='form-input'
                    placeholder={`第${step.order}步`}
                    value={step.description}
                    onInput={(e) => handleStepChange(idx, e.detail.value)}
                  />
                </View>
                {steps.length > 1 && (
                  <View className='remove-btn' onClick={() => handleRemoveStep(idx)}>
                    <Text className='remove-icon'>✕</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* 标签 */}
          <View className='form-section'>
            <Text className='section-label'>标签</Text>
            <View className='tags-input-row'>
              <View className='tag-input-wrap'>
                <Input
                  className='form-input'
                  placeholder='输入标签，按回车添加'
                  value={tagsInput}
                  onInput={(e) => setTagsInput(e.detail.value)}
                  onConfirm={handleAddTag}
                  confirmType='done'
                />
              </View>
              <View className='tag-add-btn' onClick={handleAddTag}>
                <Text className='tag-add-text'>添加</Text>
              </View>
            </View>
            {tags.length > 0 && (
              <View className='tags-display'>
                {tags.map((tag, idx) => (
                  <View key={idx} className='tag-chip'>
                    <Text className='tag-chip-text'>{tag}</Text>
                    <Text className='tag-chip-remove' onClick={() => handleRemoveTag(idx)}>✕</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 餐厅信息（外卖/外食） */}
          {(dishType === 'takeout' || dishType === 'dineout') && (
            <>
              <View className='form-section'>
                <Text className='section-label'>餐厅名称</Text>
                <View className='input-wrap'>
                  <Input
                    className='form-input'
                    placeholder='请输入餐厅名称'
                    value={restaurant}
                    onInput={(e) => setRestaurant(e.detail.value)}
                    maxlength={50}
                  />
                </View>
              </View>
              <View className='form-section'>
                <Text className='section-label'>餐厅备注</Text>
                <View className='input-wrap'>
                  <Input
                    className='form-input'
                    placeholder='如地址、特色菜等'
                    value={restaurantNote}
                    onInput={(e) => setRestaurantNote(e.detail.value)}
                    maxlength={200}
                  />
                </View>
              </View>
            </>
          )}

          {/* 图片上传 */}
          <View className='form-section'>
            <Text className='section-label'>菜品图片</Text>
            <View className='photo-upload-area'>
              {photos.map((photo, idx) => (
                <View key={idx} className='photo-item'>
                  <Image className='photo-image' src={photo} mode='aspectFill' />
                  <View className='photo-remove' onClick={() => handleRemovePhoto(idx)}>
                    <Text className='photo-remove-icon'>✕</Text>
                  </View>
                </View>
              ))}
              {photos.length < 9 && (
                <View className='photo-add' onClick={handleChooseImage}>
                  <Text className='photo-add-icon'>+</Text>
                  <Text className='photo-add-text'>添加图片</Text>
                </View>
              )}
            </View>
          </View>

          {/* 分组信息 */}
          <View className='form-section'>
            <Text className='section-label'>分组类型</Text>
            <Picker
              mode='selector'
              range={GROUP_TYPES.map(g => g.label)}
              value={getGroupTypeIndex()}
              onChange={handleGroupTypeChange}
            >
              <View className='picker-wrap'>
                <Text className='picker-value'>
                  {GROUP_TYPES.find(g => g.key === groupType)?.label || '请选择'}
                </Text>
                <Text className='picker-arrow'>›</Text>
              </View>
            </Picker>
          </View>

          {groupType === 'buddy' && buddyGroups.length > 0 && (
            <View className='form-section'>
              <Text className='section-label'>选择饭搭子群组</Text>
              <Picker
                mode='selector'
                range={buddyGroups.map(g => g.name)}
                value={getBuddyGroupIndex()}
                onChange={handleBuddyGroupChange}
              >
                <View className='picker-wrap'>
                  <Text className={groupId ? 'picker-value' : 'picker-placeholder'}>
                    {groupId ? buddyGroups.find(g => g.id === groupId)?.name : '请选择群组'}
                  </Text>
                  <Text className='picker-arrow'>›</Text>
                </View>
              </Picker>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 底部提交按钮 */}
      <View className='bottom-submit safe-bottom'>
        <View className={`submit-btn ${submitting ? 'disabled' : ''}`} onClick={handleSubmit}>
          <Text className='submit-text'>{submitting ? '提交中...' : isEdit ? '保存修改' : '提交'}</Text>
        </View>
      </View>
    </View>
  )
}
