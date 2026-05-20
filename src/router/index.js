import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import { appPages } from '../config/pages'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { landing: true },
  },
  ...appPages.map(({ path, name, component, meta }) => ({
    path,
    name,
    component,
    meta: meta ?? {},
  })),
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
