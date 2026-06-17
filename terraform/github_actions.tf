resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:mckinney99/shopify-letters:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${var.app_name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
}

data "aws_iam_policy_document" "github_actions" {
  statement {
    sid       = "ECRAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "ECRPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  statement {
    sid = "ECSDeployRead"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
    ]
    # "*" here because the condition below narrows it to etch clusters only.
    resources = ["*"]
    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      # Allow both production (etch-cluster) and staging (etch-staging-cluster)
      # without hard-coding the staging ARN (it lives in a separate tf workspace).
      values   = ["arn:aws:ecs:${var.aws_region}:*:cluster/etch*"]
    }
  }

  statement {
    sid     = "ECSDeployWrite"
    actions = ["ecs:UpdateService"]
    # Scoped to both production and staging services by name prefix.
    resources = ["arn:aws:ecs:${var.aws_region}:*:service/etch*/etch*"]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "${var.app_name}-github-actions"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions.json
}
