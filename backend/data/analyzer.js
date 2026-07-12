const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_HOURS_PER_DAY = 15;

function transactionDate(transaction) {
  return new Date(transaction.createdAt || transaction.date);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function sum(transactions, predicate) {
  return transactions.reduce(
    (total, transaction) =>
      predicate(transaction)
        ? total + Number(transaction.amount || 0)
        : total,
    0
  );
}

function round(value) {
  return Math.round(Number(value || 0));
}

function formatHour(hour) {
  const start = new Date(2000, 0, 1, hour);
  const end = new Date(2000, 0, 1, (hour + 1) % 24);

  const options = {
    hour: "numeric",
    minute: "2-digit",
  };

  return `${start.toLocaleTimeString(
    "en-US",
    options
  )} – ${end.toLocaleTimeString("en-US", options)}`;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateBaseline(agent, now = new Date()) {
  const history = Array.isArray(agent.transactionHistory)
    ? agent.transactionHistory
    : [];

  const start = new Date(now.getTime() - 30 * DAY_MS);

  const transactions = history.filter((transaction) => {
    const date = transactionDate(transaction);

    return (
      !Number.isNaN(date.getTime()) &&
      date >= start &&
      date <= now
    );
  });

  const daily = new Map();

  const hourlyCashOut = Array(24).fill(0);

  const providerTotals = {
    bKash: {
      transactions: 0,
      cashIn: 0,
      cashOut: 0,
    },
    Nagad: {
      transactions: 0,
      cashIn: 0,
      cashOut: 0,
    },
    Rocket: {
      transactions: 0,
      cashIn: 0,
      cashOut: 0,
    },
  };

  for (const transaction of transactions) {
    const date = transactionDate(transaction);
    const key = dateKey(date);

    if (!daily.has(key)) {
      daily.set(key, {
        cashIn: 0,
        cashOut: 0,
        transactions: 0,
      });
    }

    const day = daily.get(key);

    const amount = Number(transaction.amount || 0);

    day.transactions++;

    if (transaction.type === "Cash In") {
      day.cashIn += amount;
    }

    if (transaction.type === "Cash Out") {
      day.cashOut += amount;
      hourlyCashOut[date.getHours()] += amount;
    }

    if (providerTotals[transaction.provider]) {
      const provider = providerTotals[transaction.provider];

      provider.transactions++;

      if (transaction.type === "Cash In")
        provider.cashIn += amount;

      if (transaction.type === "Cash Out")
        provider.cashOut += amount;
    }
  }

  const daysCovered = daily.size;

  const divisor = Math.max(daysCovered, 1);

  const totalCashIn = [...daily.values()].reduce(
    (a, b) => a + b.cashIn,
    0
  );

  const totalCashOut = [...daily.values()].reduce(
    (a, b) => a + b.cashOut,
    0
  );

  const totalTransactions = transactions.length;

  const peakHour = hourlyCashOut.indexOf(
    Math.max(...hourlyCashOut)
  );

  const providers = Object.fromEntries(
    Object.entries(providerTotals).map(([name, values]) => [
      name,
      {
        averageDailyTransactions: round(
          values.transactions / divisor
        ),

        averageDailyCashIn: round(
          values.cashIn / divisor
        ),

        averageDailyCashOut: round(
          values.cashOut / divisor
        ),

        averageDailyNetFloatDrain: round(
          (values.cashOut - values.cashIn) / divisor
        ),
      },
    ])
  );

  return {
    historyDays: 30,

    daysCovered,

    transactionsUsed: totalTransactions,

    averageDailyTransactions: round(
      totalTransactions / divisor
    ),

    averageDailyCashIn: round(
      totalCashIn / divisor
    ),

    averageDailyCashOut: round(
      totalCashOut / divisor
    ),

    averageDailyNetCashDrain: round(
      (totalCashOut - totalCashIn) / divisor
    ),

    peakCashOutHour: peakHour,

    peakCashOutWindow: formatHour(peakHour),

    providers,
  };
}
function recentDrain(history, provider, now) {
  const start = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const recent = history.filter((transaction) => {
    const date = transactionDate(transaction);

    return (
      !Number.isNaN(date.getTime()) &&
      date >= start &&
      date <= now
    );
  });

  let drain = 0;

  for (const transaction of recent) {
    const amount = Number(transaction.amount || 0);

    if (provider === "physicalCash") {
      drain += transaction.type === "Cash Out" ? amount : -amount;
    } else if (transaction.provider === provider) {
      drain += transaction.type === "Cash Out" ? amount : -amount;
    }
  }

  return Math.max(0, drain / 6);
}

function forecastSeverity(currentBalance, predictedBalance, threshold) {
  if (
    currentBalance <= threshold.critical ||
    predictedBalance <= threshold.critical
  )
    return "Critical";

  if (
    currentBalance <= threshold.warning ||
    predictedBalance <= threshold.warning
  )
    return "Warning";

  return "Healthy";
}

export function calculateForecasts(
  agent,
  baseline,
  now = new Date()
) {
  const history = Array.isArray(agent.transactionHistory)
    ? agent.transactionHistory
    : [];

  const confidence = Math.min(
    95,
    Math.max(
      50,
      round(
        50 +
          (Math.min(baseline.daysCovered, 30) / 30) * 25 +
          (Math.min(baseline.transactionsUsed, 500) / 500) * 20
      )
    )
  );

  const definitions = [
    {
      key: "physicalCash",
      label: "Physical Cash",
      current: Number(agent.cash || 0),
      baselineDrain:
        baseline.averageDailyNetCashDrain /
        ACTIVE_HOURS_PER_DAY,
      threshold: {
        critical: 10000,
        warning: 25000,
      },
    },

    {
      key: "bKash",
      label: "bKash",
      current: Number(agent.bkash_balance || 0),
      baselineDrain:
        baseline.providers.bKash.averageDailyNetFloatDrain /
        ACTIVE_HOURS_PER_DAY,
      threshold: {
        critical: 20000,
        warning: 50000,
      },
    },

    {
      key: "Nagad",
      label: "Nagad",
      current: Number(agent.nagad_balance || 0),
      baselineDrain:
        baseline.providers.Nagad.averageDailyNetFloatDrain /
        ACTIVE_HOURS_PER_DAY,
      threshold: {
        critical: 20000,
        warning: 50000,
      },
    },

    {
      key: "Rocket",
      label: "Rocket",
      current: Number(agent.rocket_balance || 0),
      baselineDrain:
        baseline.providers.Rocket.averageDailyNetFloatDrain /
        ACTIVE_HOURS_PER_DAY,
      threshold: {
        critical: 10000,
        warning: 30000,
      },
    },
  ];

  return definitions.map((definition) => {
    const liveDrain = recentDrain(
      history,
      definition.key,
      now
    );

    // Blend historical and live drain
    let hourlyDrain =
      definition.baselineDrain * 0.75 +
      liveDrain * 0.25;

    // Prevent unrealistic spikes
    hourlyDrain = clamp(
      hourlyDrain,
      Math.max(500, definition.baselineDrain * 0.5),
      Math.max(2000, definition.baselineDrain * 2)
    );

    hourlyDrain = round(hourlyDrain);

    const balance1h = Math.max(
      0,
      round(definition.current - hourlyDrain)
    );

    const balance2h = Math.max(
      0,
      round(definition.current - hourlyDrain * 2)
    );

    const balance4h = Math.max(
      0,
      round(definition.current - hourlyDrain * 4)
    );

    const predictedBalance4h = balance4h;

    const severity = forecastSeverity(
      definition.current,
      predictedBalance4h,
      definition.threshold
    );

    let shortageAt = null;
    let shortageInMinutes = null;

    if (
      definition.current > definition.threshold.critical &&
      hourlyDrain > 0
    ) {
      const hours =
        (definition.current -
          definition.threshold.critical) /
        hourlyDrain;

      if (hours <= 24) {
        shortageAt = new Date(
          now.getTime() + hours * 60 * 60 * 1000
        );

        shortageInMinutes = round(hours * 60);
      }
    }

    let message;

    if (severity === "Healthy") {
      message = `${definition.label} is expected to remain stable throughout the next 4 hours.`;
    } else if (severity === "Warning") {
      message = `${definition.label} is under increasing demand. Additional liquidity may be required later today.`;
    } else {
      if (shortageAt) {
        message = `${definition.label} may reach the critical balance around ${formatTime(
          shortageAt
        )} if the current transaction trend continues.`;
      } else {
        message = `${definition.label} is already operating near its critical balance.`;
      }
    }

    return {
      provider: definition.label,

      key: definition.key,

      currentBalance: round(definition.current),

      hourlyDrain,

      predictedBalance1h: balance1h,

      predictedBalance2h: balance2h,

      predictedBalance4h: balance4h,

      severity,

      confidence,

      shortageAt: shortageAt
        ? shortageAt.toISOString()
        : null,

      shortageInMinutes,

      message,
    };
  });
}
export function analyzeAgent(agent) {
  const history = Array.isArray(agent.transactionHistory)
    ? agent.transactionHistory
    : [];

  const now = new Date();

  const today = dateKey(now);

  const yesterday = dateKey(
    new Date(now.getTime() - DAY_MS)
  );

  const todayTransactions = history.filter(
    (t) => dateKey(transactionDate(t)) === today
  );

  const yesterdayTransactions = history.filter(
    (t) => dateKey(transactionDate(t)) === yesterday
  );

  const cashIn = sum(
    todayTransactions,
    (t) => t.type === "Cash In"
  );

  const cashOut = sum(
    todayTransactions,
    (t) => t.type === "Cash Out"
  );

  const transactionChange =
    yesterdayTransactions.length === 0
      ? 0
      : round(
          ((todayTransactions.length -
            yesterdayTransactions.length) /
            yesterdayTransactions.length) *
            100
        );

  const baseline = calculateBaseline(agent, now);

  const forecasts = calculateForecasts(
    agent,
    baseline,
    now
  );

  const priority = {
    Critical: 0,
    Warning: 1,
    Healthy: 2,
  };

  const worstForecast = [...forecasts].sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity]
  )[0];

  //---------------------------------------------------
  // AI Summary
  //---------------------------------------------------

  const trend =
    transactionChange > 0
      ? `Today's transaction volume increased by ${transactionChange}% compared with yesterday.`
      : transactionChange < 0
      ? `Today's transaction volume decreased by ${Math.abs(
          transactionChange
        )}% compared with yesterday.`
      : "Today's transaction volume remained similar to yesterday.";

  const cashFlow =
    cashOut > cashIn
      ? `Cash Out exceeded Cash In by ৳${round(
          cashOut - cashIn
        ).toLocaleString()}, creating additional liquidity pressure.`
      : `Cash In exceeded Cash Out by ৳${round(
          cashIn - cashOut
        ).toLocaleString()}, improving liquidity availability.`;

  const peak =
    baseline.transactionsUsed > 0
      ? `Peak withdrawal activity usually occurs between ${baseline.peakCashOutWindow}.`
      : "";

  let forecastText = "";

  if (worstForecast.severity === "Healthy") {
    forecastText =
      "Based on historical behaviour and today's activity, all balances are expected to remain above their critical limits during the next four hours.";
  }

  if (worstForecast.severity === "Warning") {
    forecastText = `${worstForecast.provider} is approaching its warning threshold. If the current demand continues, additional liquidity should be prepared.`;
  }

  if (worstForecast.severity === "Critical") {
    if (worstForecast.shortageAt) {
      forecastText = `${worstForecast.provider} is projected to reach its critical balance around ${new Date(
        worstForecast.shortageAt
      ).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}.`;
    } else {
      forecastText = `${worstForecast.provider} is already operating below its recommended liquidity level.`;
    }
  }

  const analysis = `
${trend}

${cashFlow}

The prediction is based on ${baseline.transactionsUsed} transactions collected across ${baseline.daysCovered} active days with an estimated confidence of ${worstForecast.confidence}%.

${peak}

${forecastText}
`
    .replace(/\n+/g, " ")
    .trim();

  //---------------------------------------------------
  // Recommendation
  //---------------------------------------------------

  const critical = forecasts.filter(
    (f) => f.severity === "Critical"
  );

  const warning = forecasts.filter(
    (f) => f.severity === "Warning"
  );

  let recommendation =
    "Liquidity remains stable. Continue monitoring transaction activity and maintain current provider balances.";

  if (warning.length) {
    recommendation = `Prepare additional liquidity for ${warning
      .map((x) => x.provider)
      .join(
        ", "
      )}. Demand is increasing and balances may fall below the warning threshold later today.`;
  }

  if (critical.length) {
    recommendation = `Immediate action recommended. Refill ${critical
      .map((x) => x.provider)
      .join(
        ", "
      )} balance as soon as possible to avoid service interruption.`;
  }

  //---------------------------------------------------
  // Return
  //---------------------------------------------------

  return {
    balances: {
      physicalCash: agent.cash,
      bkash: agent.bkash_balance,
      nagad: agent.nagad_balance,
      rocket: agent.rocket_balance,
      liquidityPressure: agent.liquidityPressure,
    },

    todaySummary: {
      transactions: todayTransactions.length,
      cashIn,
      cashOut,
    },

    baseline,

    forecasts,

    aiAnalysis: analysis,

    recommendation,

    todayTransactions,
  };
}