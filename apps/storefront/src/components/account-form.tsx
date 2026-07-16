"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useState, type FormEvent } from "react"
import type { Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"

type Mode = "login" | "register"
type Field = "email" | "password" | "firstName" | "lastName"

function validate(form: HTMLFormElement, mode: Mode): Partial<Record<Field, string>> {
  const data = new FormData(form)
  const errors: Partial<Record<Field, string>> = {}
  const email = String(data.get("email") ?? "").trim()
  const password = String(data.get("password") ?? "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "invalid"
  if (password.length < 8) errors.password = "invalid"
  if (mode === "register") {
    if (!String(data.get("firstName") ?? "").trim()) errors.firstName = "invalid"
    if (!String(data.get("lastName") ?? "").trim()) errors.lastName = "invalid"
  }
  return errors
}

export function AccountForm({ locale, mode }: { locale: Locale; mode: Mode }) {
  const router = useRouter()
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isZh = locale === "zh-HK"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const errors = validate(event.currentTarget, mode)
    setFieldErrors(errors)
    setSummaryError(null)
    if (Object.keys(errors).length > 0) {
      setSummaryError(isZh ? "請更正以下資料。" : "Please correct the fields below.")
      return
    }

    const data = new FormData(event.currentTarget)
    const body = {
      email: String(data.get("email")),
      password: String(data.get("password")),
      ...(mode === "register" ? {
        firstName: String(data.get("firstName")),
        lastName: String(data.get("lastName")),
      } : {}),
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const result: { customer?: unknown; error?: { code?: string } } = await response.json()
      if (!response.ok || !result.customer) {
        const code = result.error?.code
        setSummaryError(
          code === "invalid_credentials"
            ? isZh ? "電郵地址或密碼不正確。" : "The email or password is incorrect."
            : code === "duplicate_email"
              ? isZh ? "此電郵地址已建立帳戶。" : "An account already exists for this email."
              : isZh ? "暫時未能處理要求，請稍後再試。" : "We could not complete this request. Please try again.",
        )
        return
      }
      router.replace(localeHref(locale, "/account/orders"))
      router.refresh()
    } catch {
      setSummaryError(
        isZh ? "暫時未能連接，請稍後再試。" : "We could not connect. Please try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const labels = {
    email: isZh ? "電郵地址" : "Email",
    password: isZh ? "密碼" : "Password",
    firstName: isZh ? "名字" : "First name",
    lastName: isZh ? "姓氏" : "Last name",
  }

  return (
    <form className="account-form" noValidate onSubmit={submit}>
      {summaryError ? (
        <div className="account-error-summary" role="alert" tabIndex={-1}>
          <strong>{isZh ? "未能提交表格" : "We could not submit the form"}</strong>
          <p>{summaryError}</p>
        </div>
      ) : null}
      {mode === "register" ? (
        <div className="account-name-grid">
          <div className="account-field">
            <label htmlFor="account-first-name">{labels.firstName}</label>
            <input id="account-first-name" name="firstName" autoComplete="given-name" aria-describedby={fieldErrors.firstName ? "account-first-name-error" : undefined} />
            {fieldErrors.firstName ? <span id="account-first-name-error">{isZh ? "請輸入名字。" : "Enter your first name."}</span> : null}
          </div>
          <div className="account-field">
            <label htmlFor="account-last-name">{labels.lastName}</label>
            <input id="account-last-name" name="lastName" autoComplete="family-name" aria-describedby={fieldErrors.lastName ? "account-last-name-error" : undefined} />
            {fieldErrors.lastName ? <span id="account-last-name-error">{isZh ? "請輸入姓氏。" : "Enter your last name."}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="account-field">
        <label htmlFor="account-email">{labels.email}</label>
        <input id="account-email" name="email" type="email" autoComplete="email" inputMode="email" aria-describedby={fieldErrors.email ? "account-email-error" : undefined} />
        {fieldErrors.email ? <span id="account-email-error">{isZh ? "請輸入有效電郵地址。" : "Enter a valid email address."}</span> : null}
      </div>
      <div className="account-field">
        <label htmlFor="account-password">{labels.password}</label>
        <input id="account-password" name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={fieldErrors.password ? "account-password-error" : undefined} />
        {fieldErrors.password ? <span id="account-password-error">{isZh ? "密碼最少需要 8 個字元。" : "Password must be at least 8 characters."}</span> : null}
      </div>
      <button className="button primary wide" type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? isZh ? "處理中..." : "Working..."
          : mode === "login"
            ? isZh ? "登入" : "Sign in"
            : isZh ? "建立帳戶" : "Create account"}
      </button>
      <p className="account-switch">
        {mode === "login"
          ? isZh ? "未有帳戶？" : "New to Fotomax?"
          : isZh ? "已有帳戶？" : "Already have an account?"}
        {" "}
        <Link href={localeHref(locale, mode === "login" ? "/account/register" : "/account/login")}>
          {mode === "login"
            ? isZh ? "建立帳戶" : "Create account"
            : isZh ? "登入" : "Sign in"}
        </Link>
      </p>
    </form>
  )
}
