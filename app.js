(function () {
  "use strict";

  const config = window.RSA_MINIAPP;
  if (!config) throw new Error("RSA_MINIAPP content is missing");

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const screens = Array.from(document.querySelectorAll("[data-screen]"));
  const backButton = document.getElementById("back-button");
  const toast = document.getElementById("toast");
  const navButtons = Array.from(document.querySelectorAll(".bottom-nav [data-go]"));
  const rootScreens = new Set(["home", "test", "platform", "services"]);
  const validScreens = new Set(screens.map((screen) => screen.dataset.screen));
  const historyStack = [];
  let currentScreen = "home";
  let toastTimer = null;

  const safeStorage = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        // Private browsing or embedded webviews may block storage.
      }
    }
  };

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(value) + "+";
  }

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
      else tg.HapticFeedback.impactOccurred("light");
    } catch (_) {
      // Telegram versions differ; haptics are an enhancement only.
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function setNativeBackButton(visible) {
    if (!tg || !tg.BackButton) return;
    try {
      if (visible) tg.BackButton.show();
      else tg.BackButton.hide();
    } catch (_) {
      // Older clients may not expose BackButton methods.
    }
  }

  function syncNavigation(screenName) {
    backButton.classList.toggle("is-visible", screenName !== "home");
    setNativeBackButton(screenName !== "home");
    const navigationParent = screenName === "consultation" ? "services" : (rootScreens.has(screenName) ? screenName : "home");

    navButtons.forEach((button) => {
      const destination = button.dataset.go;
      const isActive = destination === navigationParent;
      button.classList.toggle("is-active", isActive);
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function setHash(screenName) {
    const nextHash = screenName === "home" ? "" : "#" + screenName;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + nextHash);
    }
  }

  function go(screenName, options) {
    const opts = options || {};
    if (!validScreens.has(screenName)) screenName = "home";
    if (screenName === currentScreen && !opts.force) return;

    if (!opts.fromHistory && !opts.replace && currentScreen !== screenName) {
      historyStack.push(currentScreen);
    }

    screens.forEach((screen) => {
      const isCurrent = screen.dataset.screen === screenName;
      screen.classList.toggle("is-active", isCurrent);
      screen.setAttribute("aria-hidden", String(!isCurrent));
    });

    currentScreen = screenName;
    syncNavigation(screenName);
    setHash(screenName);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    haptic("tap");
  }

  function goBack() {
    const previous = historyStack.pop();
    go(previous || "home", { fromHistory: true, replace: true, force: true });
  }

  function openExternal(url) {
    if (!url) return;
    haptic("tap");
    if (tg && /^https:\/\/t\.me\//i.test(url) && typeof tg.openTelegramLink === "function") {
      try {
        tg.openTelegramLink(url);
        return;
      } catch (_) {
        // Fall through to the regular Telegram/browser link.
      }
    }
    if (tg && typeof tg.openLink === "function") {
      try {
        tg.openLink(url);
        return;
      } catch (_) {
        // Fall through to the browser when Telegram declines a URL.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function personalTelegramUrl(message) {
    return config.links.personalTelegram + "?text=" + encodeURIComponent(message);
  }

  function openPersonalTelegram(message) {
    haptic("tap");
    window.open(personalTelegramUrl(message), "_blank", "noopener,noreferrer");
  }

  function scrollToActualItem(itemId) {
    go("actual", { force: currentScreen === "actual" });
    window.requestAnimationFrame(() => {
      const item = document.getElementById("actual-" + itemId);
      if (item) item.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openService(serviceId) {
    go("services", { force: currentScreen === "services" });
    window.requestAnimationFrame(() => {
      document.querySelectorAll("[data-service]").forEach((details) => {
        details.open = details.dataset.service === serviceId;
      });
      const target = document.getElementById("service-" + serviceId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindNavigation() {
    document.addEventListener("click", (event) => {
      const actualTarget = event.target.closest("[data-actual-target]");
      if (actualTarget) {
        event.preventDefault();
        scrollToActualItem(actualTarget.dataset.actualTarget);
        return;
      }

      const serviceTarget = event.target.closest("[data-service-go]");
      if (serviceTarget) {
        event.preventDefault();
        openService(serviceTarget.dataset.serviceGo);
        return;
      }

      const goTarget = event.target.closest("[data-go]");
      if (goTarget) {
        event.preventDefault();
        go(goTarget.dataset.go);
        return;
      }

      const linkTarget = event.target.closest("[data-link]");
      if (linkTarget) {
        event.preventDefault();
        if (linkTarget.dataset.link === "consultation") {
          const message = promotionPhase() === "active"
            ? config.promotion.products[0].message
            : config.contactMessages.consultation;
          openPersonalTelegram(message);
          return;
        }
        openExternal(config.links[linkTarget.dataset.link]);
      }
    });

    backButton.addEventListener("click", goBack);
    if (tg && tg.BackButton && typeof tg.BackButton.onClick === "function") {
      tg.BackButton.onClick(goBack);
    }

    window.addEventListener("hashchange", () => {
      const requested = window.location.hash.replace(/^#/, "") || "home";
      if (requested !== currentScreen) go(requested, { replace: true });
    });
  }

  function getReadActualIds() {
    const stored = safeStorage.get("rsa-miniapp-read-actual-v3", []);
    return Array.isArray(stored) ? stored : [];
  }

  function isWithinRange(item, now) {
    if (item.publishedAt && now < new Date(item.publishedAt)) return false;
    if (item.expiresAt && now > new Date(item.expiresAt)) return false;
    return item.active !== false;
  }

  function visibleActualItems() {
    const now = new Date();
    return config.actual.filter((item) => isWithinRange(item, now));
  }

  function promotionPhase() {
    const now = new Date();
    if (now < new Date(config.promotion.startsAt)) return "upcoming";
    if (now <= new Date(config.promotion.expiresAt)) return "active";
    return "ended";
  }

  function unreadActualItems() {
    const read = new Set(getReadActualIds());
    return visibleActualItems().filter((item) => !read.has(item.id));
  }

  function updateNotificationBadges() {
    const count = unreadActualItems().length;
    const status = document.getElementById("actual-status");
    const readAllButton = document.getElementById("read-all-button");
    if (status) status.textContent = count ? "Новых материалов: " + count : "Всё прочитано";
    if (readAllButton) readAllButton.disabled = count === 0;
  }

  function markAllActualRead() {
    safeStorage.set("rsa-miniapp-read-actual-v3", visibleActualItems().map((item) => item.id));
    updateNotificationBadges();
    renderActual();
    renderHomeActual();
    haptic("success");
    showToast("Все обновления отмечены прочитанными");
  }

  function renderActual() {
    const list = document.getElementById("actual-list");
    const empty = document.getElementById("actual-empty");
    if (!list || !empty) return;

    const items = visibleActualItems();
    list.replaceChildren();
    empty.hidden = items.length > 0;
    const read = new Set(getReadActualIds());

    items.forEach((item) => {
      const article = document.createElement("article");
      article.className = "actual-card tone-" + item.tone;
      article.id = "actual-" + item.id;
      if (!read.has(item.id)) article.classList.add("is-unread");

      const head = document.createElement("div");
      head.className = "actual-card-header";
      const type = document.createElement("span");
      type.textContent = item.type;
      const date = document.createElement("time");
      date.textContent = item.kind === "discount"
        ? (promotionPhase() === "upcoming" ? "Старт 20 октября" : "До 20 ноября")
        : item.date;
      head.append(type, date);

      const title = document.createElement("h2");
      title.textContent = item.title;
      const description = document.createElement("p");
      description.textContent = item.description;
      article.append(head, title, description);

      if (item.kind === "discount") renderDiscountActual(article);
      else renderNoticeActual(article, item);
      list.append(article);
    });
  }

  function renderHomeActual() {
    const section = document.getElementById("home-actual");
    const list = document.getElementById("home-actual-list");
    if (!section || !list) return;

    const items = visibleActualItems();
    const read = new Set(getReadActualIds());
    section.hidden = items.length === 0;
    list.replaceChildren();

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "home-actual-card tone-" + item.tone;
      if (!read.has(item.id)) button.classList.add("is-unread");
      button.dataset.actualTarget = item.id;

      const meta = document.createElement("span");
      meta.className = "home-actual-meta";
      const type = document.createElement("b");
      type.textContent = item.type;
      const date = document.createElement("small");
      date.textContent = item.kind === "discount"
        ? (promotionPhase() === "upcoming" ? "Старт 20 октября" : "До 20 ноября")
        : item.date;
      meta.append(type, date);

      const title = document.createElement("strong");
      title.textContent = item.title;
      const description = document.createElement("span");
      description.className = "home-actual-description";
      description.textContent = item.description;
      const arrow = document.createElement("i");
      arrow.textContent = "→";
      button.append(meta, title, description, arrow);
      list.append(button);
    });
  }

  function renderNoticeActual(article, item) {
    if (item.details && item.details.length) {
      const details = document.createElement("details");
      details.className = "actual-details";
      const summary = document.createElement("summary");
      summary.textContent = "Подробнее";
      const body = document.createElement("div");
      item.details.forEach((paragraph) => {
        const text = document.createElement("p");
        text.textContent = paragraph;
        body.append(text);
      });
      details.append(summary, body);
      article.append(details);
    }

    if (item.actions && item.actions.length) {
      const actions = document.createElement("div");
      actions.className = "actual-actions";
      item.actions.forEach((itemAction) => {
        const action = document.createElement("button");
        action.type = "button";
        action.className = itemAction.primary ? "actual-primary-action" : "actual-secondary-action";
        action.textContent = itemAction.label;
        action.addEventListener("click", () => openExternal(config.links[itemAction.link]));
        actions.append(action);
      });
      article.append(actions);
    }
  }

  function renderDiscountActual(article) {
    const phase = promotionPhase();
    const callout = document.createElement("div");
    callout.className = "promotion-callout";
    callout.innerHTML = "<strong>Первый шаг — платная консультация</strong><p>При переходе в менторское или индивидуальное сопровождение её стоимость полностью засчитывается. Обращение до 20 ноября включительно фиксирует скидку; дальнейшие даты вы согласуете с Дианой лично.</p>";

    const products = document.createElement("div");
    products.className = "promotion-products";
    config.promotion.products.forEach((product) => {
      const link = document.createElement("a");
      link.className = "promotion-product";
      link.href = personalTelegramUrl(product.message);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "Получить скидку на " + product.name);

      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = product.name;
      const note = document.createElement("small");
      note.textContent = product.note || (phase === "upcoming" ? "Скидка начнёт действовать 20 октября" : "Получить скидку");
      copy.append(name, note);

      const prices = document.createElement("span");
      prices.className = "promotion-prices";
      const regular = document.createElement("del");
      regular.textContent = product.regularPrice;
      const discounted = document.createElement("b");
      discounted.textContent = product.discountPrice;
      prices.append(regular, discounted);

      link.append(copy, prices);
      products.append(link);
    });

    const note = document.createElement("p");
    note.className = "promotion-note";
    note.textContent = phase === "upcoming"
      ? "Предложение начнёт действовать 20 октября и завершится 20 ноября 2026 года."
      : "Предложение действует до 20 ноября 2026 года включительно.";

    const contact = document.createElement("a");
    contact.className = "promotion-contact";
    contact.href = config.links.personalTelegram;
    contact.target = "_blank";
    contact.rel = "noopener noreferrer";
    contact.textContent = "Написать Диане в Telegram · @romanova_studyabroad";

    article.append(callout, products, contact, note);
  }

  function renderFaq() {
    const list = document.getElementById("faq-list");
    if (!list) return;
    list.replaceChildren();

    config.faqs.forEach((faq, index) => {
      const item = document.createElement("article");
      item.className = "faq-item";
      const question = document.createElement("button");
      question.type = "button";
      question.className = "faq-question";
      question.setAttribute("aria-expanded", "false");
      question.setAttribute("aria-controls", "faq-answer-" + index);
      const questionText = document.createTextNode(faq.question);
      const marker = document.createElement("span");
      marker.textContent = "+";
      question.append(questionText, marker);

      const answer = document.createElement("div");
      answer.className = "faq-answer";
      answer.id = "faq-answer-" + index;
      answer.textContent = faq.answer;

      question.addEventListener("click", () => {
        const wasOpen = item.classList.contains("is-open");
        list.querySelectorAll(".faq-item").forEach((row) => {
          row.classList.remove("is-open");
          row.querySelector(".faq-question").setAttribute("aria-expanded", "false");
        });
        if (!wasOpen) {
          item.classList.add("is-open");
          question.setAttribute("aria-expanded", "true");
        }
        haptic("tap");
      });

      item.append(question, answer);
      list.append(item);
    });
  }

  const quiz = {
    step: 0,
    answers: {},
    questions: [
      {
        key: "stage",
        label: "Этап",
        question: "На каком вы этапе?",
        options: [
          ["explore", "⌕", "Только изучаю возможности"],
          ["choose", "◇", "Выбираю страны и программы"],
          ["prepare", "✎", "Готовлю документы"],
          ["applying", "✓", "Уже подаю заявки или близки дедлайны"]
        ]
      },
      {
        key: "need",
        label: "Задача",
        question: "Какая помощь вам нужна сейчас?",
        options: [
          ["options", "↗", "Разобраться в вариантах"],
          ["programs", "⌕", "Найти программы и стипендии"],
          ["strategy", "◇", "Построить личную стратегию"],
          ["review", "✓", "Проверять документы и контролировать процесс"],
          ["full", "◎", "Передать основную работу"]
        ]
      },
      {
        key: "workStyle",
        label: "Участие",
        question: "Как вы хотите участвовать в процессе?",
        options: [
          ["self", "◉", "Всё делать самостоятельно"],
          ["consultation", "1", "Один раз подробно разобрать ситуацию"],
          ["mentor", "↻", "Работать самостоятельно с регулярной обратной связью"],
          ["full", "◎", "Делегировать Диане основную часть работы"]
        ]
      },
      {
        key: "deadline",
        label: "Сроки",
        question: "Сколько времени до ближайших дедлайнов?",
        options: [
          ["year", "12+", "Больше года"],
          ["sixToTwelve", "6–12", "От 6 до 12 месяцев"],
          ["threeToSix", "3–6", "От 3 до 6 месяцев"],
          ["urgent", "!", "Меньше 3 месяцев"],
          ["unknown", "?", "Пока не знаю"]
        ]
      }
    ]
  };

  function resetQuiz() {
    quiz.step = 0;
    quiz.answers = {};
    document.getElementById("test-intro").hidden = false;
    document.getElementById("test-panel").hidden = true;
    document.getElementById("test-result").hidden = true;
  }

  function startQuiz() {
    quiz.step = 0;
    quiz.answers = {};
    document.getElementById("test-intro").hidden = true;
    document.getElementById("test-result").hidden = true;
    document.getElementById("test-panel").hidden = false;
    renderQuizStep();
    haptic("tap");
  }

  function renderQuizStep() {
    const question = quiz.questions[quiz.step];
    const progress = document.getElementById("test-progress");
    const stepLabel = document.getElementById("test-step");
    const quizBackButton = document.getElementById("test-back-button");
    const questionTitle = document.getElementById("test-question");
    const options = document.getElementById("test-options");

    progress.replaceChildren();
    quiz.questions.forEach((_, index) => {
      const bar = document.createElement("i");
      if (index < quiz.step) bar.className = "is-done";
      else if (index === quiz.step) bar.className = "is-active";
      progress.append(bar);
    });

    stepLabel.textContent = question.label + " · вопрос " + (quiz.step + 1) + " из " + quiz.questions.length;
    quizBackButton.hidden = quiz.step === 0;
    questionTitle.textContent = question.question;
    options.replaceChildren();

    question.options.forEach(([value, icon, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "test-option";
      if (quiz.answers[question.key] === value) button.classList.add("is-selected");
      const iconNode = document.createElement("span");
      iconNode.textContent = icon;
      const textNode = document.createElement("b");
      textNode.textContent = label;
      button.append(iconNode, textNode);
      button.addEventListener("click", () => answerQuiz(question.key, value));
      options.append(button);
    });
  }

  function goQuizBack() {
    if (quiz.step === 0) return;
    quiz.step -= 1;
    renderQuizStep();
    haptic("tap");
  }

  function editQuizAnswers() {
    quiz.step = 0;
    document.getElementById("test-intro").hidden = true;
    document.getElementById("test-result").hidden = true;
    document.getElementById("test-panel").hidden = false;
    renderQuizStep();
    haptic("tap");
  }

  function answerQuiz(key, value) {
    quiz.answers[key] = value;
    haptic("tap");
    if (quiz.step < quiz.questions.length - 1) {
      quiz.step += 1;
      renderQuizStep();
      return;
    }
    showQuizResult();
  }

  function addQuizScore(scores, additions) {
    Object.entries(additions).forEach(([key, value]) => {
      scores[key] += value;
    });
  }

  function currentQuizPrice(recommendation) {
    const phase = promotionPhase();
    const regular = {
      self: "7 дней бесплатно · далее от 3 900 ₽",
      consultation: "20 000 ₽ · 90 минут",
      mentor: "90 000 ₽/месяц · минимум 2 месяца",
      full: "от 180 000 ₽"
    };
    const upcoming = {
      consultation: "20 000 ₽ · с 20 октября — 16 000 ₽",
      mentor: "90 000 ₽/мес · с 20 октября — 72 000 ₽/мес",
      full: "от 180 000 ₽ · с 20 октября — от 144 000 ₽"
    };
    const active = {
      consultation: "16 000 ₽ по акции до 20 ноября",
      mentor: "72 000 ₽/мес на весь период по акции",
      full: "от 144 000 ₽ по акции до 20 ноября"
    };
    if (phase === "upcoming" && upcoming[recommendation]) return upcoming[recommendation];
    if (phase === "active" && active[recommendation]) return active[recommendation];
    return regular[recommendation];
  }

  function chooseQuizResult() {
    const answer = quiz.answers;
    const scores = { self: 0, consultation: 0, mentor: 0, full: 0 };
    const scoreByStage = {
      explore: { self: 2, consultation: 1 },
      choose: { self: 1, consultation: 2, mentor: 1 },
      prepare: { consultation: 1, mentor: 2, full: 1 },
      applying: { consultation: 2, mentor: 3 }
    };
    const scoreByNeed = {
      options: { self: 2, consultation: 2 },
      programs: { self: 3, consultation: 1 },
      strategy: { consultation: 4, mentor: 1 },
      review: { consultation: 1, mentor: 4 },
      full: { consultation: 1, full: 5 }
    };
    const scoreByWorkStyle = {
      self: { self: 4 },
      consultation: { consultation: 4 },
      mentor: { mentor: 4 },
      full: { full: 4 }
    };
    const scoreByDeadline = {
      year: { self: 2, consultation: 1 },
      sixToTwelve: { self: 1, consultation: 1, mentor: 1, full: 1 },
      threeToSix: { consultation: 2, mentor: 2, full: 1 },
      urgent: { consultation: 3, mentor: 2 },
      unknown: { consultation: 2 }
    };

    addQuizScore(scores, scoreByStage[answer.stage] || {});
    addQuizScore(scores, scoreByNeed[answer.need] || {});
    addQuizScore(scores, scoreByWorkStyle[answer.workStyle] || {});
    addQuizScore(scores, scoreByDeadline[answer.deadline] || {});

    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
    const topScore = ranked[0][1];
    const topRecommendations = ranked.filter((entry) => entry[1] === topScore).map((entry) => entry[0]);
    const answersConflict =
      (answer.workStyle === "self" && answer.need === "full") ||
      (answer.workStyle === "full" && answer.stage === "explore" && ["options", "programs"].includes(answer.need)) ||
      (answer.workStyle === "full" && answer.stage === "applying" && answer.deadline === "urgent");
    let recommendation;
    if (answersConflict) recommendation = "consultation";
    else if (topRecommendations.includes(answer.workStyle)) recommendation = answer.workStyle;
    else if (topRecommendations.includes("consultation")) recommendation = "consultation";
    else recommendation = topRecommendations[0];

    if (recommendation === "full" && answer.workStyle !== "full" && answer.need !== "full") recommendation = "consultation";
    if (recommendation === "mentor" && answer.workStyle !== "mentor" && answer.need !== "review") recommendation = "consultation";

    const stageReasons = {
      explore: "Вы пока изучаете возможности и можете спокойно собрать общую картину без лишней спешки.",
      choose: "Вы уже выбираете направление и программы — сейчас особенно важно сузить варианты и выстроить логику выбора.",
      prepare: "Вы готовите документы и заявки, поэтому вам нужен формат, который поможет двигаться по конкретному плану.",
      applying: "Вы уже подаёте заявки или приближаетесь к дедлайнам, поэтому особенно важны приоритеты и контроль сроков."
    };
    const needReasons = {
      options: "Сейчас вам важно разобраться в возможностях и не потеряться в вариантах.",
      programs: "Главная задача — найти подходящие программы и финансирование.",
      strategy: "Вам нужна личная стратегия, собранная вокруг вашего профиля и целей.",
      review: "Вам важны регулярная проверка документов и контроль процесса.",
      full: "Вы хотите передать специалисту основную часть работы."
    };
    const deadlineReasons = {
      year: "До дедлайнов больше года — есть время выстроить путь последовательно.",
      sixToTwelve: "До дедлайнов 6–12 месяцев — уже стоит закрепить план и темп работы.",
      threeToSix: "До дедлайнов 3–6 месяцев — нужен конкретный план без лишних шагов.",
      urgent: "До дедлайнов меньше трёх месяцев — сначала нужно оценить, что реально успеть.",
      unknown: "Сроки пока не определены, поэтому важно сначала уточнить маршрут."
    };
    const stageReason = stageReasons[answer.stage] || "Ваши ответы помогают выбрать удобный следующий шаг.";
    const needReason = needReasons[answer.need] || "";
    const deadlineReason = deadlineReasons[answer.deadline] || "";
    const conflictReason = answersConflict
      ? "В ответах сочетаются разные задачи или форматы участия, поэтому сначала лучше уточнить стратегию на консультации."
      : "";

    const results = {
      self: {
        key: "self",
        formatName: "Платформа",
        title: "Ваш путь — платформа",
        text: "Самостоятельный маршрут с базой программ и стипендий, гайдами и сохранённым прогрессом. Можно двигаться в своём темпе и подключить личную работу позже.",
        reason: stageReason + " " + needReason + " " + deadlineReason + " Вы готовы двигаться самостоятельно с материалами и базой.",
        price: currentQuizPrice("self"),
        formatLabel: "Посмотреть платформу",
        screen: "platform"
      },
      consultation: {
        key: "consultation",
        formatName: "Консультация",
        title: "Начните с консультации",
        text: "За 90 минут разберём именно вашу ситуацию и соберём конкретный план. Через 2–3 дня после встречи вы получите ориентировочный подбор из 10–15 программ.",
        reason: stageReason + " " + needReason + " " + deadlineReason + " " + (conflictReason || "Разовый подробный разбор поможет определить следующий шаг без лишних обязательств."),
        price: currentQuizPrice("consultation"),
        formatLabel: "Подробнее о консультации",
        screen: "consultation"
      },
      mentor: {
        key: "mentor",
        formatName: "Менторское сопровождение",
        title: "Вам подойдёт менторское сопровождение",
        text: "Вы ведёте процесс самостоятельно, а Диана помогает со стратегией, проверяет документы, контролирует дедлайны и регулярно даёт обратную связь.",
        reason: stageReason + " " + needReason + " " + deadlineReason + " Вы готовы делать основную работу сами, но хотите экспертную проверку и поддержку по ходу поступления.",
        price: currentQuizPrice("mentor"),
        formatLabel: "Посмотреть менторство",
        screen: "services",
        service: "mentor"
      },
      full: {
        key: "full",
        formatName: "Индивидуальное сопровождение",
        title: "Вам подойдёт индивидуальное сопровождение",
        text: "Диана берёт на себя основную часть процесса: от стратегии и подбора программ до документов, заявок и получения офферов.",
        reason: stageReason + " " + needReason + " " + deadlineReason + " Вы хотите передать эксперту основную часть работы и получать готовый маршрут действий.",
        price: currentQuizPrice("full"),
        formatLabel: "Посмотреть сопровождение",
        screen: "services",
        service: "individual"
      }
    };

    return results[recommendation] || results.consultation;
  }

  function quizDiscussionMessage(result) {
    const labels = getQuizAnswerLabels();
    return [
      "Здравствуйте, Диана! Я прошёл(а) тест в мини-приложении Romanova StudyAbroad.",
      "",
      "Этап: " + (labels[0] || "не указан"),
      "Задача: " + (labels[1] || "не указана"),
      "Участие: " + (labels[2] || "не указано"),
      "Сроки: " + (labels[3] || "не указаны"),
      "Рекомендация: " + result.formatName + ".",
      "",
      "Хочу обсудить результат и понять следующий шаг."
    ].join("\n");
  }

  function openQuizFormat(result) {
    if (result.actualId) scrollToActualItem(result.actualId);
    else if (result.service) openService(result.service);
    else go(result.screen);
  }

  function getQuizAnswerLabels() {
    return quiz.questions.map((question) => {
      const selected = question.options.find(([value]) => value === quiz.answers[question.key]);
      return selected ? selected[2] : "";
    }).filter(Boolean);
  }

  function showQuizResult() {
    const result = chooseQuizResult();
    const resultNode = document.getElementById("test-result");
    document.getElementById("test-panel").hidden = true;
    resultNode.hidden = false;
    resultNode.replaceChildren();

    const card = document.createElement("div");
    card.className = "test-result-card";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Ваша рекомендация";
    const title = document.createElement("h2");
    title.textContent = result.title;
    const text = document.createElement("p");
    text.textContent = result.text;
    const price = document.createElement("p");
    price.className = "test-result-price";
    price.textContent = result.price;
    const answers = document.createElement("div");
    answers.className = "test-answer-summary";
    answers.setAttribute("aria-label", "Ваши ответы");
    getQuizAnswerLabels().forEach((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      answers.append(chip);
    });
    const reason = document.createElement("div");
    reason.className = "test-result-reason";
    const reasonTitle = document.createElement("strong");
    reasonTitle.textContent = "Почему подходит";
    const reasonText = document.createElement("p");
    reasonText.textContent = result.reason;
    reason.append(reasonTitle, reasonText);
    card.append(eyebrow, title, text, price, answers, reason);

    const actions = document.createElement("div");
    actions.className = "test-result-actions";
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "button button-primary";
    primary.textContent = "Обсудить результат с Дианой";
    primary.addEventListener("click", () => openPersonalTelegram(quizDiscussionMessage(result)));
    const secondary = document.createElement("button");
    secondary.type = "button";
    secondary.className = "button button-secondary";
    secondary.textContent = result.formatLabel;
    secondary.addEventListener("click", () => openQuizFormat(result));
    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "text-button";
    restart.textContent = "Изменить ответы";
    restart.addEventListener("click", editQuizAnswers);
    actions.append(primary, secondary, restart);
    resultNode.append(card, actions);
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: true });
    haptic("success");
  }

  function hydrateFacts() {
    document.querySelectorAll("[data-program-count]").forEach((node) => {
      node.textContent = formatNumber(config.facts.programs);
    });
  }

  function hydratePromotionStatus() {
    const phase = promotionPhase();
    document.querySelectorAll("[data-promotion-banner]").forEach((banner) => {
      banner.hidden = phase === "ended";
      const status = banner.querySelector("[data-promotion-status]");
      if (status) {
        status.textContent = phase === "upcoming"
          ? "Старт 20 октября · посмотреть условия"
          : "Действует до 20 ноября включительно";
      }
    });
    if (phase !== "active") return;
    document.querySelectorAll('[data-link="consultation"]').forEach((button) => {
      button.textContent = "Получить скидку в Telegram";
      button.setAttribute("aria-label", "Написать Диане о консультации со скидкой 20%");
    });
  }

  function setupTelegram() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.setHeaderColor === "function") tg.setHeaderColor("#ffffff");
      if (typeof tg.setBackgroundColor === "function") tg.setBackgroundColor("#f5f7fb");
    } catch (_) {
      // The page remains fully usable in a regular browser.
    }
  }

  function initialise() {
    setupTelegram();
    bindNavigation();
    renderActual();
    renderHomeActual();
    renderFaq();
    hydrateFacts();
    hydratePromotionStatus();
    updateNotificationBadges();
    document.getElementById("read-all-button").addEventListener("click", markAllActualRead);
    document.getElementById("start-test-button").addEventListener("click", startQuiz);
    document.getElementById("test-back-button").addEventListener("click", goQuizBack);
    resetQuiz();

    const requested = window.location.hash.replace(/^#/, "") || "home";
    currentScreen = "home";
    if (requested !== "home") go(requested, { replace: true, force: true });
    else syncNavigation("home");
  }

  initialise();
})();
