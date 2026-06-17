resource "aws_ecs_cluster" "staging" {
  name = "${var.app_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_cloudwatch_log_group" "staging" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 14
}

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.app_name}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db.arn,
      aws_secretsmanager_secret.shopify.arn,
      aws_secretsmanager_secret.tunnel_token.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "${var.app_name}-read-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

resource "aws_iam_role" "ecs_task" {
  name               = "${var.app_name}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

data "aws_iam_policy_document" "ecs_exec" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_exec" {
  name   = "${var.app_name}-ecs-exec"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_exec.json
}

resource "aws_ecs_task_definition" "staging" {
  family                   = var.app_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "etch"
      image     = "${data.aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "SCOPES", value = var.shopify_scopes },
        { name = "SHOPIFY_APP_URL", value = "https://staging.${var.domain_name}" },
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${aws_secretsmanager_secret.db.arn}:DATABASE_URL::"
        },
        {
          name      = "SHOPIFY_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.shopify.arn}:SHOPIFY_API_KEY::"
        },
        {
          name      = "SHOPIFY_API_SECRET"
          valueFrom = "${aws_secretsmanager_secret.shopify.arn}:SHOPIFY_API_SECRET::"
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.staging.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "etch"
        }
      }
    },
    {
      name      = "cloudflared"
      image     = "cloudflare/cloudflared:2024.11.1"
      essential = false

      # Reads TUNNEL_TOKEN from the environment and connects outbound to the
      # Cloudflare edge. All containers in an awsvpc task share localhost, so
      # the tunnel routes staging.etch.direct → http://localhost:3000.
      command = ["tunnel", "--no-autoupdate", "run"]

      secrets = [
        {
          name      = "TUNNEL_TOKEN"
          valueFrom = aws_secretsmanager_secret.tunnel_token.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.staging.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "cloudflared"
        }
      }
    }
  ])

  tags = {
    Name = var.app_name
  }
}

resource "aws_ecs_service" "staging" {
  name                   = var.app_name
  cluster                = aws_ecs_cluster.staging.id
  task_definition        = aws_ecs_task_definition.staging.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = local.public_subnet_ids
    security_groups  = [aws_security_group.ecs_task.id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
