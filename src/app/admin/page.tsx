/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, Settings, Users, Video } from 'lucide-react';
import { GripVertical } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import PageLayout from '@/components/PageLayout';

// 统一弹窗方法（必须在首次使用前定义）
const showError = (message: string) =>
  Swal.fire({ icon: 'error', title: '错误', text: message });

const showSuccess = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: '成功',
    text: message,
    timer: 2000,
    showConfirmButton: false,
  });

// 新增站点配置类型
interface SiteConfig {
  SiteName: string;
  Announcement: string;
  SearchDownstreamMaxPage: number;
  SiteInterfaceCacheTime: number;
  ImageProxy: string;
}

// 视频源数据类型
interface DataSource {
  name: string;
  key: string;
  api: string;
  detail?: string;
  disabled?: boolean;
  from: 'config' | 'custom';
}

// 可折叠标签组件
interface CollapsibleTabProps {
  title: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleTab = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: CollapsibleTabProps) => {
  return (
    <div className='rounded-xl shadow-sm mb-4 overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700'>
      <button
        onClick={onToggle}
        className='w-full px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors'
      >
        <div className='flex items-center gap-3'>
          {icon}
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            {title}
          </h3>
        </div>
        <div className='text-gray-500 dark:text-gray-400'>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpanded && <div className='px-6 py-4'>{children}</div>}
    </div>
  );
};

// 用户配置组件
interface UserConfigProps {
  config: AdminConfig | null;
  role: 'owner' | 'admin' | null;
  refreshConfig: () => Promise<void>;
}

const UserConfig = ({ config, role, refreshConfig }: UserConfigProps) => {
  const [userSettings, setUserSettings] = useState({
    enableRegistration: false,
  });
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
  });
  const [changePasswordUser, setChangePasswordUser] = useState({
    username: '',
    password: '',
  });

  // 当前登录用户名
  const currentUsername = getAuthInfoFromBrowserCookie()?.username || null;

  // 检测存储类型是否为 d1
  const isD1Storage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'd1';

  useEffect(() => {
    if (config?.UserConfig) {
      setUserSettings({
        enableRegistration: config.UserConfig.AllowRegister,
      });
    }
  }, [config]);

  // 切换允许注册设置
  const toggleAllowRegister = async (value: boolean) => {
    try {
      // 先更新本地 UI
      setUserSettings((prev) => ({ ...prev, enableRegistration: value }));

      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAllowRegister',
          allowRegister: value,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `操作失败: ${res.status}`);
      }

      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败');
      // revert toggle UI
      setUserSettings((prev) => ({ ...prev, enableRegistration: !value }));
    }
  };

  const handleBanUser = async (uname: string) => {
    await handleUserAction('ban', uname);
  };

  const handleUnbanUser = async (uname: string) => {
    await handleUserAction('unban', uname);
  };

  const handleSetAdmin = async (uname: string) => {
    await handleUserAction('setAdmin', uname);
  };

  const handleRemoveAdmin = async (uname: string) => {
    await handleUserAction('cancelAdmin', uname);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return;
    await handleUserAction('add', newUser.username, newUser.password);
    setNewUser({ username: '', password: '' });
    setShowAddUserForm(false);
  };

  const handleChangePassword = async () => {
    if (!changePasswordUser.username || !changePasswordUser.password) return;
    await handleUserAction(
      'changePassword',
      changePasswordUser.username,
      changePasswordUser.password
    );
    setChangePasswordUser({ username: '', password: '' });
    setShowChangePasswordForm(false);
  };

  const handleShowChangePasswordForm = (username: string) => {
    setChangePasswordUser({ username, password: '' });
    setShowChangePasswordForm(true);
    setShowAddUserForm(false); // 关闭添加用户表单
  };

  const handleDeleteUser = async (username: string) => {
    const { isConfirmed } = await Swal.fire({
      title: '确认删除用户',
      text: `删除用户 ${username} 将同时删除其搜索历史、播放记录和收藏夹，此操作不可恢复！`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      confirmButtonColor: '#dc2626',
    });

    if (!isConfirmed) return;

    await handleUserAction('deleteUser', username);
  };

  // 通用请求函数
  const handleUserAction = async (
    action:
      | 'add'
      | 'ban'
      | 'unban'
      | 'setAdmin'
      | 'cancelAdmin'
      | 'changePassword'
      | 'deleteUser',
    targetUsername: string,
    targetPassword?: string
  ) => {
    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername,
          ...(targetPassword ? { targetPassword } : {}),
          action,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `操作失败: ${res.status}`);
      }

      // 成功后刷新配置（无需整页刷新）
      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败');
    }
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        加载中...
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 用户统计 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          用户统计
        </h4>
        <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
          <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
            {config.UserConfig.Users.length}
          </div>
          <div className='text-sm text-green-600 dark:text-green-400'>
            总用户数
          </div>
        </div>
      </div>

      {/* 注册设置 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          注册设置
        </h4>
        <div className='flex items-center justify-between'>
          <label className='text-gray-700 dark:text-gray-300'>
            允许新用户注册
          </label>
          <button
            onClick={() =>
              toggleAllowRegister(!userSettings.enableRegistration)
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              userSettings.enableRegistration
                ? 'bg-green-600'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                userSettings.enableRegistration
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      <div>
        <div className='flex items-center justify-between mb-3'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            用户列表
          </h4>
          <button
            onClick={() => {
              setShowAddUserForm(!showAddUserForm);
              if (showChangePasswordForm) {
                setShowChangePasswordForm(false);
                setChangePasswordUser({ username: '', password: '' });
              }
            }}
            className='px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors'
          >
            {showAddUserForm ? '取消' : '添加用户'}
          </button>
        </div>

        {/* 添加用户表单 */}
        {showAddUserForm && (
          <div className='p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 mb-4 space-y-3'>
            <div>
              <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                用户名
              </label>
              <input
                type='text'
                value={newUser.username}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, username: e.target.value }))
                }
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
            </div>
            <div>
              <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                密码
              </label>
              <input
                type='password'
                value={newUser.password}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, password: e.target.value }))
                }
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
            </div>
            <button
              onClick={handleAddUser}
              className='w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors'
            >
              提交
            </button>
          </div>
        )}

        {/* 修改密码表单 */}
        {showChangePasswordForm && (
          <div className='p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800 mb-4 space-y-3'>
            <div className='flex justify-between items-center'>
              <h5 className='text-sm font-medium text-blue-800 dark:text-blue-300'>
                修改用户 {changePasswordUser.username} 的密码
              </h5>
              <button
                onClick={() => {
                  setShowChangePasswordForm(false);
                  setChangePasswordUser({ username: '', password: '' });
                }}
                className='text-blue-600 dark:text-blue-400 text-xs'
              >
                取消
              </button>
            </div>
            <div>
              <label className='block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1'>
                新密码
              </label>
              <input
                type='password'
                value={changePasswordUser.password}
                onChange={(e) =>
                  setChangePasswordUser((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className='w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>
            <button
              onClick={handleChangePassword}
              className='w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors'
            >
              提交修改
            </button>
          </div>
        )}

        <div className='overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-gray-800/50'>
              <tr>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  用户名
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  角色
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  状态
                </th>
                <th className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  操作
                </th>
              </tr>
            </thead>
            {(() => {
              // 权限判断
              const operatorRole = role; // 'owner' | 'admin'
              return (
                <tbody className='bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700'>
                  {config.UserConfig.Users.map((user) => {
                    const isTargetAdmin = user.role === 'admin';
                    const isTargetOwner = user.role === 'owner';
                    const isSelf = user.username === currentUsername;

                    // 权限逻辑
                    const canChangePassword =
                      !isTargetOwner &&
                      (operatorRole === 'owner' || isSelf || !isTargetAdmin);
                    const canOperate =
                      !isTargetOwner &&
                      !isSelf &&
                      (operatorRole === 'owner' || !isTargetAdmin);
                    const canDeleteUser =
                      !isTargetOwner &&
                      !isSelf &&
                      (operatorRole === 'owner' || !isTargetAdmin);

                    return (
                      <tr
                        key={user.username}
                        className='hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
                      >
                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                          {user.username}
                          {isSelf && (
                            <span className='ml-2 text-xs text-green-600 dark:text-green-400 font-normal'>
                              (我自己)
                            </span>
                          )}
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'owner'
                                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                                : user.role === 'admin'
                                ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {user.role === 'owner'
                              ? '站长'
                              : user.role === 'admin'
                              ? '管理员'
                              : '普通用户'}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              !user.banned
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {!user.banned ? '正常' : '已封禁'}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
                          {/* 修改密码按钮 */}
                          {canChangePassword && (
                            <button
                              onClick={() =>
                                handleShowChangePasswordForm(user.username)
                              }
                              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-200 transition-colors'
                            >
                              修改密码
                            </button>
                          )}
                          {canOperate && (
                            <>
                              {/* 其他操作按钮 */}
                              {user.role === 'user' && (
                                <button
                                  onClick={() => handleSetAdmin(user.username)}
                                  className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 dark:text-purple-200 transition-colors'
                                >
                                  设为管理
                                </button>
                              )}
                              {user.role === 'admin' && (
                                <button
                                  onClick={() =>
                                    handleRemoveAdmin(user.username)
                                  }
                                  className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/40 dark:hover:bg-gray-700/60 dark:text-gray-200 transition-colors'
                                >
                                  取消管理
                                </button>
                              )}
                              {user.role !== 'owner' &&
                                (!user.banned ? (
                                  <button
                                    onClick={() => handleBanUser(user.username)}
                                    className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 transition-colors'
                                  >
                                    封禁
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleUnbanUser(user.username)
                                    }
                                    className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60 dark:text-green-300 transition-colors'
                                  >
                                    解封
                                  </button>
                                ))}
                            </>
                          )}
                          {/* 删除用户按钮 - 放在最后，使用更明显的红色样式 */}
                          {canDeleteUser && (
                            <button
                              onClick={() => handleDeleteUser(user.username)}
                              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 transition-colors'
                            >
                              删除用户
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
};

// 视频源配置组件
const VideoSourceConfig = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);
  const [newSource, setNewSource] = useState<DataSource>({
    name: '',
    key: '',
    api: '',
    detail: '',
    disabled: false,
    from: 'config',
  });

  // dnd-kit 传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 轻微位移即可触发
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // 长按 150ms 后触发，避免与滚动冲突
        tolerance: 5,
      },
    })
  );

  // 初始化
  useEffect(() => {
    if (config?.SourceConfig) {
      setSources(config.SourceConfig);
      // 进入时重置 orderChanged
      setOrderChanged(false);
    }
  }, [config]);

  // 通用 API 请求
  const callSourceApi = async (body: Record<string, any>) => {
    try {
      const resp = await fetch('/api/admin/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `操作失败: ${resp.status}`);
      }

      // 成功后刷新配置
      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败');
      throw err; // 向上抛出方便调用处判断
    }
  };

  const handleToggleEnable = (key: string) => {
    const target = sources.find((s) => s.key === key);
    if (!target) return;
    const action = target.disabled ? 'enable' : 'disable';
    callSourceApi({ action, key }).catch(() => {
      console.error('操作失败', action, key);
    });
  };

  const handleDelete = (key: string) => {
    callSourceApi({ action: 'delete', key }).catch(() => {
      console.error('操作失败', 'delete', key);
    });
  };

  const handleAddSource = () => {
    if (!newSource.name || !newSource.key || !newSource.api) return;
    callSourceApi({
      action: 'add',
      key: newSource.key,
      name: newSource.name,
      api: newSource.api,
      detail: newSource.detail,
    })
      .then(() => {
        setNewSource({
          name: '',
          key: '',
          api: '',
          detail: '',
          disabled: false,
          from: 'custom',
        });
        setShowAddForm(false);
      })
      .catch(() => {
        console.error('操作失败', 'add', newSource);
      });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sources.findIndex((s) => s.key === active.id);
    const newIndex = sources.findIndex((s) => s.key === over.id);
    setSources((prev) => arrayMove(prev, oldIndex, newIndex));
    setOrderChanged(true);
  };

  const handleSaveOrder = () => {
    const order = sources.map((s) => s.key);
    callSourceApi({ action: 'sort', order })
      .then(() => {
        setOrderChanged(false);
      })
      .catch(() => {
        console.error('操作失败', 'sort', order);
      });
  };

  // 可拖拽行封装 (dnd-kit)
  const DraggableRow = ({ source }: { source: DataSource }) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: source.key });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    } as React.CSSProperties;

    return (
      <tr
        ref={setNodeRef}
        style={style}
        className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors select-none'
      >
        <td
          className='px-2 py-4 cursor-grab text-gray-400'
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
          {source.name}
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
          {source.key}
        </td>
        <td
          className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-[12rem] truncate'
          title={source.api}
        >
          {source.api}
        </td>
        <td
          className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-[8rem] truncate'
          title={source.detail || '-'}
        >
          {source.detail || '-'}
        </td>
        <td className='px-6 py-4 whitespace-nowrap max-w-[1rem]'>
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              !source.disabled
                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}
          >
            {!source.disabled ? '启用' : '禁用'}
          </span>
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
          <button
            onClick={() => handleToggleEnable(source.key)}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${
              source.disabled
                ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60 dark:text-green-300'
                : 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:hover:bg-orange-900/60 dark:text-orange-300'
            } transition-colors`}
          >
            {source.disabled ? '启用' : '禁用'}
          </button>
          <button
            onClick={() => handleDelete(source.key)}
            className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 transition-colors'
          >
            删除
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center mb-2'>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
          资源站列表 (拖动左侧图标可排序)
        </h4>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className='px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors'
        >
          {showAddForm ? '取消添加' : '添加源'}
        </button>
      </div>

      {/* 添加源表单 */}
      {showAddForm && (
        <div className='p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3 mb-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <div>
              <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                站点名称
              </label>
              <input
                type='text'
                placeholder='例如: 电影天堂'
                value={newSource.name}
                onChange={(e) =>
                  setNewSource((prev) => ({ ...prev, name: e.target.value }))
                }
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
            </div>
            <div>
              <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                唯一 Key (小写字母/数字)
              </label>
              <input
                type='text'
                placeholder='例如: dytt'
                value={newSource.key}
                onChange={(e) =>
                  setNewSource((prev) => ({ ...prev, key: e.target.value }))
                }
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
            </div>
          </div>
          <div>
            <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
              API 地址 (标准 CMS V10 JSON API)
            </label>
            <input
              type='text'
              placeholder='https://example.com/api.php/provide/vod'
              value={newSource.api}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, api: e.target.value }))
              }
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
            />
          </div>
          <div>
            <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
              网页详情页前缀 (可选，部分站点需要)
            </label>
            <input
              type='text'
              placeholder='https://example.com'
              value={newSource.detail}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, detail: e.target.value }))
              }
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
            />
          </div>
          <button
            onClick={handleAddSource}
            className='w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors'
          >
            提交添加
          </button>
        </div>
      )}

      <div className='overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700'>
        <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
          <thead className='bg-gray-50 dark:bg-gray-800/50'>
            <tr>
              <th className='px-2 py-3 w-8'></th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                名称
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                Key
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                API 地址
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                详情前缀
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                状态
              </th>
              <th className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                操作
              </th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            autoScroll={false}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={sources.map((s) => s.key)}
              strategy={verticalListSortingStrategy}
            >
              <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
                {sources.map((source) => (
                  <DraggableRow key={source.key} source={source} />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      {/* 保存排序按钮 */}
      {orderChanged && (
        <div className='flex justify-end'>
          <button
            onClick={handleSaveOrder}
            className='px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors'
          >
            保存排序
          </button>
        </div>
      )}
    </div>
  );
};

// 新增站点配置组件
const SiteConfigComponent = ({ config }: { config: AdminConfig | null }) => {
  const [siteSettings, setSiteSettings] = useState<SiteConfig>({
    SiteName: '',
    Announcement: '',
    SearchDownstreamMaxPage: 1,
    SiteInterfaceCacheTime: 7200,
    ImageProxy: '',
  });
  // 保存状态
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config?.SiteConfig) {
      setSiteSettings({
        ...config.SiteConfig,
        ImageProxy: config.SiteConfig.ImageProxy || '',
      });
    }
  }, [config]);

  // 保存站点配置
  const handleSave = async () => {
    try {
      setSaving(true);
      const resp = await fetch('/api/admin/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...siteSettings }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `保存失败: ${resp.status}`);
      }

      showSuccess('保存成功, 请刷新页面');
    } catch (err) {
      showError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        加载中...
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 站点名称 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点名称
        </label>
        <input
          type='text'
          value={siteSettings.SiteName}
          onChange={(e) =>
            setSiteSettings((prev) => ({ ...prev, SiteName: e.target.value }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 站点公告 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点公告
        </label>
        <textarea
          value={siteSettings.Announcement}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              Announcement: e.target.value,
            }))
          }
          rows={3}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 搜索接口可拉取最大页数 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          搜索接口可拉取最大页数
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SearchDownstreamMaxPage}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SearchDownstreamMaxPage: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 站点接口缓存时间 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点接口缓存时间（秒）
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SiteInterfaceCacheTime}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SiteInterfaceCacheTime: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 图片代理 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          图片代理前缀
        </label>
        <input
          type='text'
          placeholder='例如: https://imageproxy.example.com/?url='
          value={siteSettings.ImageProxy}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              ImageProxy: e.target.value,
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          用于代理图片访问，解决跨域或访问限制问题。留空则不使用代理。
        </p>
      </div>

      {/* 操作按钮 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 ${
            saving
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700'
          } text-white rounded-lg transition-colors`}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
};

function AdminPageClient() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | null>(null);
  const [expandedTabs, setExpandedTabs] = useState<{ [key: string]: boolean }>({
    userConfig: false,
    videoSource: false,
    siteConfig: false,
  });

  // 获取管理员配置
  // showLoading 用于控制是否在请求期间显示整体加载骨架。
  const fetchConfig = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch(`/api/admin/config`);

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(`获取配置失败: ${data.error}`);
      }

      const data = (await response.json()) as AdminConfigResult;
      setConfig(data.Config);
      setRole(data.Role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取配置失败';
      showError(msg);
      setError(msg);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // 首次加载时显示骨架
    fetchConfig(true);
  }, [fetchConfig]);

  // 切换标签展开状态
  const toggleTab = (tabKey: string) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabKey]: !prev[tabKey],
    }));
  };

  // 新增: 重置配置处理函数
  const handleResetConfig = async () => {
    const { isConfirmed } = await Swal.fire({
      title: '确认重置配置',
      text: '此操作将重置用户封禁和管理员设置、自定义视频源，站点配置将重置为默认值，是否继续？',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    });
    if (!isConfirmed) return;

    try {
      const response = await fetch(`/api/admin/reset`);
      if (!response.ok) {
        throw new Error(`重置失败: ${response.status}`);
      }
      showSuccess('重置成功，请刷新页面！');
    } catch (err) {
      showError(err instanceof Error ? err.message : '重置失败');
    }
  };

  if (loading) {
    return (
      <PageLayout activePath='/admin'>
        <div className='px-2 sm:px-10 py-4 sm:py-8'>
          <div className='max-w-[95%] mx-auto'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8'>
              管理员设置
            </h1>
            <div className='space-y-4'>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className='h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse'
                />
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    // 错误已通过 SweetAlert2 展示，此处直接返回空
    return null;
  }

  return (
    <PageLayout activePath='/admin'>
      <div className='px-2 sm:px-10 py-4 sm:py-8'>
        <div className='max-w-[95%] mx-auto'>
          {/* 标题 + 重置配置按钮 */}
          <div className='flex items-center gap-2 mb-8'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              管理员设置
            </h1>
            {config && role === 'owner' && (
              <button
                onClick={handleResetConfig}
                className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md transition-colors'
              >
                重置配置
              </button>
            )}
          </div>

          {/* 站点配置标签 */}
          <CollapsibleTab
            title='站点配置'
            icon={
              <Settings
                size={20}
                className='text-gray-600 dark:text-gray-400'
              />
            }
            isExpanded={expandedTabs.siteConfig}
            onToggle={() => toggleTab('siteConfig')}
          >
            <SiteConfigComponent config={config} />
          </CollapsibleTab>

          <div className='space-y-4'>
            {/* 用户配置标签 */}
            <CollapsibleTab
              title='用户配置'
              icon={
                <Users size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.userConfig}
              onToggle={() => toggleTab('userConfig')}
            >
              <UserConfig
                config={config}
                role={role}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* 视频源配置标签 */}
            <CollapsibleTab
              title='视频源配置'
              icon={
                <Video size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.videoSource}
              onToggle={() => toggleTab('videoSource')}
            >
              <VideoSourceConfig config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageClient />
    </Suspense>
  );
}
