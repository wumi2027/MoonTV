'use client';

export const runtime = 'edge';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-white dark:bg-black text-gray-900 dark:text-gray-200 px-4'>
      <div className='text-center'>
        <h1 className='text-8xl font-bold text-gray-200 dark:text-gray-800 select-none'>
          404
        </h1>
        <h2 className='mt-4 text-2xl font-semibold text-gray-700 dark:text-gray-300'>
          页面不存在
        </h2>
        <p className='mt-2 text-gray-500 dark:text-gray-400'>
          您访问的页面不存在或已被删除
        </p>
        <Link
          href='/'
          className='mt-8 inline-block rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700 transition-colors duration-200'
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
